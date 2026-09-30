import OpenAI from "openai";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { ensureTenant } from "../domain/tenant.js";
import { isHumanOperatorMessage } from "../domain/message-kind.js";
import { buildTranscript } from "../domain/transcript.js";
import { resolveSessionPanel } from "../domain/session-panel.js";
import { costUsd, nextRetryDelayMinutes, pricesConfigured } from "../domain/cost.js";
import {
  calculateNotaConversa,
  cutText,
  normalizeStage1,
  Stage1OutputSchema,
  STAGE1_PROMPT_VERSION,
  STAGE1_SYSTEM_PROMPT,
  stage1JsonSchema,
} from "../domain/stage1.js";
import { truncateEvidence } from "../utils/anonymizer.js";
import { withTemperature } from "../domain/openai-params.js";

// Reexporta para manter compatibilidade com quem importa daqui.
export { calculateNotaConversa, STAGE1_PROMPT_VERSION };
export type { Stage1Output } from "../domain/stage1.js";

const BATCH_SIZE = 25;

export interface Stage1Options {
  tenantId?: string;
  limit?: number;
  promptVersion?: string;
  /** Reanalisa mesmo sessões já `done`/`skipped` na versão (job manual). */
  forceReanalyze?: boolean;
  /** Analisa só esta sessão (id externo da FLW). */
  sessionExternalId?: string;
  /** Só sessões encerradas a partir desta data (padrão: GO_LIVE_AT). */
  since?: string;
}

export async function runJobDStage1Analysis(options: Stage1Options = {}): Promise<void> {
  const tenantId = options.tenantId || env.DEFAULT_TENANT_ID;
  const promptVersion = options.promptVersion || STAGE1_PROMPT_VERSION;
  const model = env.OPENAI_MODEL_STAGE1 || "gpt-4.1-mini";

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada no .env.");
  }

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: env.OPENAI_TIMEOUT_STAGE1_MS, maxRetries: 3 });
  const tenant = await ensureTenant(tenantId);

  const prices = { inputPer1M: env.OPENAI_PRICE_STAGE1_INPUT_PER_1M, outputPer1M: env.OPENAI_PRICE_STAGE1_OUTPUT_PER_1M };
  const capEnabled = pricesConfigured(prices) && env.OPENAI_MAX_USD_PER_RUN > 0;
  if (!capEnabled) {
    console.warn("[Job D] Preços da OpenAI não configurados: o teto OPENAI_MAX_USD_PER_RUN não será aplicado.");
  }

  const agents = await prisma.agent.findMany({ where: { tenantId }, select: { externalId: true, name: true } });
  const agentNames = new Map(agents.map((a) => [a.externalId, a.name]));
  const panelNames = new Map<string, string>(
    [
      [tenant.panelVendasId, "Vendas"],
      [tenant.panelCampanhasId, "Campanhas"],
      [tenant.panelPecasId, "Peças"],
      [tenant.panelOficinaId, "Oficina"],
    ].filter((p): p is [string, string] => !!p[0])
  );
  const tenantPanelIds = [...panelNames.keys()];

  const sinceRaw = options.since ?? tenant.goLiveAt?.toISOString();
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const now = new Date();

  // Fila (PRD §9.2): COMPLETED sem análise `done`/`skipped` nesta versão. Erro volta com backoff e limite de tentativas.
  const where: any = {
    tenantId,
    status: "COMPLETED",
    // Sem `endAt` a sessão não pertence a nenhuma janela; e a paginação abaixo precisa dele.
    ...(options.sessionExternalId
      ? { externalId: options.sessionExternalId }
      : { endAt: { not: null, ...(since ? { gte: since } : {}) } }),
    ...(options.forceReanalyze || options.sessionExternalId
      ? {}
      : {
          analyses: {
            none: {
              promptVersion,
              OR: [
                { status: { in: ["done", "skipped"] } },
                { status: "error", attempts: { gte: env.STAGE1_MAX_ATTEMPTS } },
                { status: "error", nextRetryAt: { gt: now } },
              ],
            },
          },
        }),
  };

  console.log(`[Job D] Buscando sessões COMPLETED pendentes de análise para o tenant: ${tenantId}...`);

  let processed = 0;
  let done = 0;
  let skipped = 0;
  let failed = 0;
  let spent = 0;
  let capped = false;
  // Paginação pelo VALOR (endAt, id), não por cursor de registro: as sessões recém-processadas
  // saem da fila (done/skipped) e um cursor apontando para elas devolveria uma página vazia.
  let last: { endAt: Date; id: string } | null = null;

  outer: while (true) {
    const batch: Array<any> = await prisma.session.findMany({
      where: last
        ? {
            AND: [
              where,
              { OR: [{ endAt: { lt: last.endAt } }, { endAt: last.endAt, id: { gt: last.id } }] },
            ],
          }
        : where,
      orderBy: [{ endAt: "desc" }, { id: "asc" }],
      take: BATCH_SIZE,
      include: {
        messages: { orderBy: { timestamp: "asc" } },
        panelCards: { select: { panelId: true, panelTitle: true, stepTitle: true, status: true, flwUpdatedAt: true } },
      },
    });
    if (batch.length === 0) break;
    const tail = batch[batch.length - 1];
    last = { endAt: tail.endAt as Date, id: tail.id };

    for (const session of batch) {
      if (options.limit !== undefined && processed >= options.limit) break outer;
      if (capped) break outer;
      processed++;

      const key = {
        tenantId_sessionExternalId_promptVersion: { tenantId, sessionExternalId: session.externalId, promptVersion },
      };
      const prev = await prisma.sessionAnalysis.findUnique({ where: key, select: { attempts: true } });
      const skip = async (reason: string) => {
        console.log(`[Job D] Sessão ${session.externalId} pulada: ${reason}.`);
        const data = { status: "skipped", skippedReason: reason, model, errorText: null };
        await prisma.sessionAnalysis.upsert({
          where: key,
          update: data,
          create: { tenantId, sessionExternalId: session.externalId, sessionId: session.id, promptVersion, ...data },
        });
        skipped++;
      };

      if (session.sessionType === "GROUP") {
        await skip("conversa de grupo");
        continue;
      }
      if (!session.messages.some(isHumanOperatorMessage)) {
        await skip("sem mensagens humanas da operação");
        continue;
      }

      const { lines, stats } = buildTranscript(session.messages, {
        tz: tenant.timezone,
        agentNames,
        anonymize: { clientNames: [session.contactName, session.contactNameWhatsapp], clientPhone: session.contactPhone },
        maxTokens: env.STAGE1_MAX_TRANSCRIPT_TOKENS,
      });
      if (lines.filter((l) => l.n != null).length === 0) {
        await skip("sem conteúdo de conversa");
        continue;
      }

      if (capEnabled && spent >= env.OPENAI_MAX_USD_PER_RUN) {
        capped = true;
        console.warn(`[Job D] Teto de US$ ${env.OPENAI_MAX_USD_PER_RUN} atingido; as sessões restantes ficam pendentes.`);
        break outer;
      }

      const panel = resolveSessionPanel(session.panelCards, tenantPanelIds);
      const panelLine = panel.panelId
        ? `Painel: ${panel.panelTitle ?? panelNames.get(panel.panelId) ?? "?"} | Etapa: ${panel.stepTitle ?? "N/D"}`
        : "Painel: sem esteira";
      const fmt = (d: Date | null) => (d ? d.toISOString() : "N/D");
      const userPrompt = `Metadados:
- Atendente responsável: ${session.agentName || "Não identificado"}
- Equipe: ${session.departmentName || "Geral"}
- ${panelLine}
- Início: ${fmt(session.startAt)} | Fim: ${fmt(session.endAt)}${stats.atendentesHumanos > 1 ? `\n- Atenção: ${stats.atendentesHumanos} atendentes humanos participaram (transferência).` : ""}

Transcrição (uma mensagem por linha, JSON):
${lines.map((l) => JSON.stringify(l)).join("\n")}`;

      const extra = {
        transcriptTruncated: stats.truncated,
        messagesOmitted: stats.truncated ? stats.messagesOmitted : null,
        audioSemTranscricao: stats.audioSemTranscricao,
        atendentesHumanos: stats.atendentesHumanos,
      };

      try {
        const completion = await withTemperature(model, 0, (temperature) =>
          openai.chat.completions.create({
            model,
            ...(temperature !== undefined ? { temperature } : {}),
            messages: [
              { role: "system", content: STAGE1_SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_schema", json_schema: stage1JsonSchema as any },
          })
        );

        const cost = costUsd(completion.usage, prices);
        spent += cost;

        const choice = completion.choices[0];
        if (choice?.message?.refusal) throw new Error(`recusa do modelo: ${choice.message.refusal}`);
        if (choice?.finish_reason === "length") throw new Error("resposta cortada (limite de tokens)");
        const rawJson = choice?.message?.content;
        if (!rawJson) throw new Error("OpenAI retornou resposta vazia.");

        const { output: parsed, warnings } = normalizeStage1(Stage1OutputSchema.parse(JSON.parse(rawJson)));
        if (warnings.length) console.warn(`[Job D] Sessão ${session.externalId}: ${warnings.join("; ")}`);

        const anon = { clientNames: [session.contactName, session.contactNameWhatsapp], clientPhone: session.contactPhone };
        const ev = (t?: string) => truncateEvidence(t || "", 200, anon);
        const notaConversa = calculateNotaConversa(parsed);
        const data = {
          status: "done",
          model,
          skippedReason: null,
          scoreAtrito: parsed.atrito.aplica ? parsed.atrito.nota : null,
          scoreSolucao: parsed.solucao.aplica ? parsed.solucao.nota : null,
          scoreNecessidade: parsed.necessidade.aplica ? parsed.necessidade.nota : null,
          scoreProximoPasso: parsed.proximo_passo.aplica ? parsed.proximo_passo.nota : null,
          scoreResolvida: parsed.resolvida.aplica ? parsed.resolvida.nota : null,
          notaConversa,
          evidencias: {
            atrito: ev(parsed.atrito.evidencia),
            solucao: ev(parsed.solucao.evidencia),
            necessidade: ev(parsed.necessidade.evidencia),
            proximo_passo: ev(parsed.proximo_passo.evidencia),
            resolvida: ev(parsed.resolvida.evidencia),
          },
          resumo1Linha: cutText(truncateEvidence(parsed.resumo, 1000, anon), 200),
          entidades: (parsed.entidades as any) ?? undefined,
          analyzedAt: new Date(),
          errorText: null,
          nextRetryAt: null,
          inputTokens: completion.usage?.prompt_tokens ?? null,
          outputTokens: completion.usage?.completion_tokens ?? null,
          costUsd: cost,
          ...extra,
        };
        await prisma.sessionAnalysis.upsert({
          where: key,
          update: data,
          create: { tenantId, sessionExternalId: session.externalId, sessionId: session.id, promptVersion, ...data },
        });
        done++;
        console.log(`[Job D] Sessão ${session.externalId} analisada: nota ${notaConversa ?? "N/A"}`);
      } catch (err: any) {
        failed++;
        const attempts = (prev?.attempts ?? 0) + 1;
        console.error(`[Job D] Erro ao analisar sessão ${session.externalId} (tentativa ${attempts}):`, err.message);
        const data = {
          status: "error",
          model,
          errorText: String(err.message).slice(0, 1000),
          attempts,
          nextRetryAt: new Date(Date.now() + nextRetryDelayMinutes(attempts) * 60_000),
          ...extra,
        };
        await prisma.sessionAnalysis.upsert({
          where: key,
          update: data,
          create: { tenantId, sessionExternalId: session.externalId, sessionId: session.id, promptVersion, ...data },
        });
      }
    }
  }

  console.log(
    `[Job D] Finalizado: ${done} analisadas, ${skipped} puladas, ${failed} com erro${capEnabled ? `; gasto estimado US$ ${spent.toFixed(4)}` : ""}${capped ? " (teto atingido)" : ""}.`
  );
}
