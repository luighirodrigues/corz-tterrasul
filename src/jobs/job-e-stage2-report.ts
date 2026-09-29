import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { calculateSynthetics } from "./job-c-synthetics.js";
import { STAGE1_PROMPT_VERSION } from "./job-d-stage1-analysis.js";
import { checkPublishGate } from "../domain/publish-gate.js";
import { previousPeriod, type Period } from "../domain/period.js";
import { ensureTenant } from "../domain/tenant.js";
import { aggregateQuality, CRITERION_LABEL, pickCases, type AnalysisRow, type Criterion } from "../domain/aggregate.js";
import { parseList, tallyCards } from "../domain/lost-reasons.js";
import { resolveSessionPanel } from "../domain/session-panel.js";
import { withTemperature } from "../domain/openai-params.js";
import {
  buildStage2Input,
  finalizeStage2,
  STAGE2_PROMPT_VERSION,
  STAGE2_SYSTEM_PROMPT,
  stage2JsonSchema,
  type RawStage2Output,
} from "../domain/stage2.js";

export { STAGE2_PROMPT_VERSION };

const RawItemSchema = z.object({
  criterio: z.enum(["atrito", "solucao", "necessidade", "proximoPasso", "resolvida"]),
  faixa: z.enum(["alto", "baixo"]),
  texto: z.string(),
  script_sugerido: z.string().nullable(),
});

export const Stage2OutputSchema = z.object({
  pontos_fortes: z.array(RawItemSchema),
  oportunidades: z.array(RawItemSchema),
});

export interface ReportScope {
  scopeType: "geral" | "divisao" | "painel" | "agente";
  scopeId: string;
  name: string;
  panelIds?: string[];
  agentExternalId?: string;
}

export interface RunStage2Options {
  tenantId?: string;
  startDate: Date;
  endDate: Date;
  promptVersion?: string;
  /** Não grava nada; devolve os relatórios como rascunho. */
  dryRun?: boolean;
  /** Publica mesmo com a trava falhando; cada falha vai para `limitacoes`. */
  allowIncomplete?: boolean;
  /** Correção explícita de relatório já publicado (exige `reason`). */
  correct?: boolean;
  reason?: string;
}

export interface ReportDraft {
  scopeType: string;
  scopeId: string;
  sinteticos: unknown;
  qualidade: unknown;
  funil: unknown;
  textoFortes: unknown;
  textoOps: unknown;
  preliminar: boolean;
  limitacoes: string | null;
  comparativo: unknown;
  promptVersionSintese: string;
  model: string;
}

export interface Stage2Result {
  drafts: ReportDraft[];
  published: number;
  skippedExisting: number;
  corrected: number;
}

const fmtPct = (x: number) => `${Math.round(x * 100)}%`;

export async function runJobEStage2Reports(options: RunStage2Options): Promise<Stage2Result> {
  const tenantId = options.tenantId || env.DEFAULT_TENANT_ID;
  const promptVersion = options.promptVersion || STAGE2_PROMPT_VERSION;
  const model = env.OPENAI_MODEL_STAGE2 || "gpt-4.1";

  if (options.correct && !options.reason?.trim()) {
    throw new Error('--correct exige --reason "texto".');
  }

  const tenant = await ensureTenant(tenantId);
  const lists = {
    outOfControl: parseList(tenant.ignoredLostReasons),
    hygiene: parseList(tenant.hygieneLostReasons),
  };
  const tenantPanelIds = [
    tenant.panelVendasId,
    tenant.panelCampanhasId,
    tenant.panelPecasId,
    tenant.panelOficinaId,
  ].filter((id): id is string => !!id);

  // Trava de publicação (checklist §16)
  const period: Period = { start: options.startDate, end: options.endDate, label: "" };
  const gate = await checkPublishGate(tenantId, period, STAGE1_PROMPT_VERSION);
  const gateLimitations: string[] = [];
  if (!gate.ok) {
    if (options.dryRun) {
      console.warn(`[Job E] (rascunho) Trava de publicação falharia:\n - ${gate.problems.join("\n - ")}`);
    } else if (options.allowIncomplete) {
      console.warn(`[Job E] Publicando com --allow-incomplete:\n - ${gate.problems.join("\n - ")}`);
      gateLimitations.push(...gate.problems.map((p) => `Publicado com --allow-incomplete: ${p}`));
    } else {
      throw new Error(
        `Publicação bloqueada:\n - ${gate.problems.join("\n - ")}\nUse --allow-incomplete para publicar mesmo assim (as falhas vão para as limitações).`
      );
    }
  }

  const result: Stage2Result = { drafts: [], published: 0, skippedExisting: 0, corrected: 0 };
  const openai = env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: env.OPENAI_TIMEOUT_STAGE2_MS, maxRetries: 3 })
    : null;

  console.log(`[Job E] Iniciando relatórios do período: ${options.startDate.toISOString()} até ${options.endDate.toISOString()}`);

  // 1. Escopos
  const scopes: ReportScope[] = [{ scopeType: "geral", scopeId: "geral", name: "Visão Geral da Operação" }];

  const carPanels = [tenant.panelVendasId, tenant.panelCampanhasId].filter((id): id is string => !!id);
  if (carPanels.length > 0) {
    scopes.push({ scopeType: "divisao", scopeId: "carros", name: "Venda de Veículos", panelIds: carPanels });
  }
  const partsPanels = [tenant.panelPecasId, tenant.panelOficinaId].filter((id): id is string => !!id);
  if (partsPanels.length > 0) {
    scopes.push({ scopeType: "divisao", scopeId: "pecas", name: "Peças e Oficina", panelIds: partsPanels });
  }
  const panelScopes: Array<[string | null, string]> = [
    [tenant.panelVendasId, "Painel Vendas"],
    [tenant.panelCampanhasId, "Painel Campanhas"],
    [tenant.panelPecasId, "Painel Peças"],
    [tenant.panelOficinaId, "Painel Oficina"],
  ];
  for (const [id, name] of panelScopes) {
    if (id) scopes.push({ scopeType: "painel", scopeId: id, name, panelIds: [id] });
  }

  // Atendentes: com sessão encerrada OU iniciada na janela (M13)
  const agentsWithSessions = await prisma.session.findMany({
    where: {
      tenantId,
      agentExternalId: { not: null },
      OR: [
        { status: "COMPLETED", endAt: { gte: options.startDate, lte: options.endDate } },
        { startAt: { gte: options.startDate, lte: options.endDate } },
      ],
    },
    select: { agentExternalId: true, agentName: true },
    distinct: ["agentExternalId"],
  });
  for (const ag of agentsWithSessions) {
    if (ag.agentExternalId) {
      scopes.push({
        scopeType: "agente",
        scopeId: ag.agentExternalId,
        name: ag.agentName || `Atendente ${ag.agentExternalId}`,
        agentExternalId: ag.agentExternalId,
      });
    }
  }

  console.log(`[Job E] Serão gerados ${scopes.length} relatórios por escopo.`);

  /** Qualidade do escopo numa janela: sessões COMPLETED encerradas nela (M13). */
  async function collectQuality(scope: ReportScope, start: Date, end: Date, forceAvailable?: readonly Criterion[]) {
    const sessions = await prisma.session.findMany({
      where: {
        tenantId,
        status: "COMPLETED",
        endAt: { gte: start, lte: end },
        ...(scope.agentExternalId ? { agentExternalId: scope.agentExternalId } : {}),
        ...(scope.panelIds?.length ? { panelCards: { some: { panelId: { in: scope.panelIds } } } } : {}),
      },
      include: {
        analyses: { where: { promptVersion: STAGE1_PROMPT_VERSION } },
        panelCards: { select: { panelId: true, panelTitle: true, stepTitle: true, status: true, flwUpdatedAt: true } },
      },
    });

    const rows: AnalysisRow[] = [];
    let nSkipped = 0;
    let nError = 0;
    let nPending = 0;
    let nSemEsteira = 0;
    let nDuplicateCards = 0;

    for (const s of sessions) {
      const info = resolveSessionPanel(s.panelCards, tenantPanelIds);
      if (info.panelId === null) nSemEsteira++;
      if (info.duplicateCards > 0) nDuplicateCards++;

      const a = s.analyses.find((x) => x.status === "done");
      if (a) {
        rows.push({
          scores: {
            atrito: a.scoreAtrito,
            solucao: a.scoreSolucao,
            necessidade: a.scoreNecessidade,
            proximoPasso: a.scoreProximoPasso,
            resolvida: a.scoreResolvida,
          },
          resumo: a.resumo1Linha,
          evidencias: (a.evidencias as Record<string, string> | null) ?? null,
        });
      } else if (s.analyses.some((x) => x.status === "skipped")) nSkipped++;
      else if (s.analyses.some((x) => x.status === "error")) nError++;
      else nPending++;
    }

    const qualidade = aggregateQuality(rows, {
      minCoverage: env.CRITERION_MIN_COVERAGE,
      n: sessions.length,
      nSkipped,
      nError,
      nSemEsteira: scope.panelIds ? 0 : nSemEsteira,
      forceAvailable,
    });
    return { sessions, rows, qualidade, nSkipped, nError, nPending, nSemEsteira, nDuplicateCards };
  }

  for (const scope of scopes) {
    console.log(`[Job E] Processando escopo: [${scope.scopeType}] ${scope.name} (${scope.scopeId})...`);
    const limitations: string[] = [...gateLimitations];

    const { sessions, rows, qualidade, nSkipped, nError, nPending, nSemEsteira, nDuplicateCards } =
      await collectQuality(scope, options.startDate, options.endDate);
    const preliminar = qualidade.nComNota < 10;

    // Evolução: semana anterior RECALCULADA com a régua atual (mesmos critérios), só para a seta.
    // O ponto histórico da semana anterior (linha publicada) não é tocado.
    let comparativo: unknown = null;
    {
      const prevP = previousPeriod({ start: options.startDate, end: options.endDate, label: "" }, tenant.timezone);
      const availableNow = (Object.keys(CRITERION_LABEL) as Criterion[]).filter((c) => qualidade.contagens[c]);
      const prev = await collectQuality(scope, prevP.start, prevP.end, availableNow);
      const coverage = prev.qualidade.n > 0 ? prev.qualidade.nDone / prev.qualidade.n : 0;
      if (qualidade.notaGeral != null && prev.qualidade.notaGeral != null && coverage >= 0.8) {
        const d1 = (a: number, b: number) => Number((a - b).toFixed(1));
        const deltaMedias: Record<string, number | null> = {};
        for (const c of availableNow) {
          const cur = qualidade.medias[c];
          const old = prev.qualidade.medias[c];
          deltaMedias[c] = cur != null && old != null ? d1(cur, old) : null;
        }
        comparativo = {
          periodoAnterior: { start: prevP.start.toISOString(), end: prevP.end.toISOString() },
          notaAnteriorRecalculada: prev.qualidade.notaGeral,
          deltaNota: d1(qualidade.notaGeral, prev.qualidade.notaGeral),
          mediasAnteriores: prev.qualidade.medias,
          deltaMedias,
          nAnterior: prev.qualidade.nComNota,
        };
      } else if (qualidade.notaGeral != null && prev.qualidade.n > 0) {
        limitations.push(
          `Sem comparação com a semana anterior: só ${fmtPct(coverage)} das conversas dela têm análise na versão atual.`
        );
      }
    }

    // B. Sintéticos (Job C) com os mesmos painéis do escopo
    const sinteticos = await calculateSynthetics({
      tenantId,
      startDate: options.startDate,
      endDate: options.endDate,
      agentExternalId: scope.agentExternalId,
      panelIds: scope.panelIds,
    });

    // C. Funil CRM (cards criados na janela; status ATUAL do card)
    let funil: any = null;
    if (scope.panelIds && scope.panelIds.length > 0) {
      const cards = await prisma.panelCard.findMany({
        where: {
          tenantId,
          panelId: { in: scope.panelIds },
          flwCreatedAt: { gte: options.startDate, lte: options.endDate },
        },
        select: { status: true, stepTitle: true, lostReason: true },
      });
      const etapas: Record<string, number> = {};
      const lostReasons: Record<string, number> = {};
      for (const c of cards) {
        if (c.stepTitle) etapas[c.stepTitle] = (etapas[c.stepTitle] || 0) + 1;
        if (c.status.toUpperCase() === "LOST" && c.lostReason) {
          lostReasons[c.lostReason] = (lostReasons[c.lostReason] || 0) + 1;
        }
      }
      const t = tallyCards(cards, lists);
      funil = {
        etapas,
        open: t.open,
        won: t.won,
        lost: t.lost,
        lostReasons,
        desconsideradas: { foraDoControle: t.lostOutOfControl, higienizacao: t.lostHygiene },
      };
    }

    // D. IA estágio 2: recebe contagens já calculadas; o número do bullet vem do código
    let textoFortes: unknown = null;
    let textoOps: unknown = null;

    if (qualidade.nComNota === 0) {
      textoFortes = [];
      textoOps = [];
    } else if (!openai) {
      limitations.push("Síntese de IA indisponível: OPENAI_API_KEY não configurada.");
    } else {
      try {
        const available = (Object.keys(CRITERION_LABEL) as Criterion[]).filter((c) => qualidade.contagens[c]);
        const input = buildStage2Input(
          scope.name,
          qualidade,
          {
            tmr: sinteticos.tmrMedioFormatado,
            sem_resposta_pct: sinteticos.semRespostaPct,
            fechamento_pct: sinteticos.taxaFechamentoPct,
          },
          pickCases(rows, available)
        );

        const comp = await withTemperature(model, 0.3, (temperature) =>
          openai.chat.completions.create({
            model,
            ...(temperature !== undefined ? { temperature } : {}),
            messages: [
              { role: "system", content: STAGE2_SYSTEM_PROMPT },
              { role: "user", content: JSON.stringify(input) },
            ],
            response_format: { type: "json_schema", json_schema: stage2JsonSchema as any },
          })
        );

        const choice = comp.choices[0];
        if (choice?.message?.refusal) throw new Error(`recusa do modelo: ${choice.message.refusal}`);
        if (choice?.finish_reason === "length") throw new Error("resposta cortada (limite de tokens)");
        if (!choice?.message?.content) throw new Error("resposta vazia");

        const raw = Stage2OutputSchema.parse(JSON.parse(choice.message.content)) as RawStage2Output;
        const fin = finalizeStage2(raw, qualidade);
        textoFortes = fin.fortes;
        textoOps = fin.oportunidades;
        limitations.push(...fin.descartes);
      } catch (err: any) {
        console.warn(`[Job E] Síntese com IA falhou para ${scope.name}: ${err.message}`);
        limitations.push(`Síntese de IA indisponível: ${err.message}`);
      }
    }

    // E. Limitações declaradas (nunca escondidas)
    if (preliminar) {
      limitations.push(`Amostra preliminar: ${qualidade.nComNota} conversas com nota (mínimo 10).`);
    }
    if (nSkipped || nError || nPending) {
      const parts = [
        nSkipped ? `${nSkipped} puladas (sem fala humana)` : "",
        nError ? `${nError} com erro de análise` : "",
        nPending ? `${nPending} ainda sem análise` : "",
      ].filter(Boolean);
      limitations.push(`Conversas fora da nota: ${parts.join(", ")}.`);
    }
    if (!scope.panelIds && nSemEsteira > 0) {
      limitations.push(`${nSemEsteira} de ${sessions.length} conversas sem card (sem esteira).`);
    }
    for (const c of qualidade.criteriosIndisponiveis) {
      const cover = rows.length ? rows.filter((r) => r.scores[c] != null).length / rows.length : 0;
      limitations.push(`Critério "${CRITERION_LABEL[c]}" fora da nota: aplicável em ${fmtPct(cover)} das conversas.`);
    }
    if (nDuplicateCards > 0) limitations.push(`${nDuplicateCards} sessões com mais de um card; usado o mais recente.`);
    if (sinteticos.tmrFallbackCount) {
      limitations.push(`TMR de ${sinteticos.tmrFallbackCount} conversas veio do campo da sessão (sem mensagens no espelho).`);
    }
    if (funil) limitations.push("Funil usa o status atual dos cards, não o status no fim da janela.");

    // F. Persistir (imutável): só cria; correção é explícita e deixa revisão
    const data = {
      sinteticos: sinteticos as any,
      qualidade: qualidade as any,
      funil: funil as any,
      textoFortes: textoFortes as any,
      textoOps: textoOps as any,
      preliminar,
      limitacoes: limitations.length ? limitations.join("\n") : null,
      comparativo: comparativo as any,
      promptVersionSintese: promptVersion,
      model,
    };

    if (options.dryRun) {
      result.drafts.push({ scopeType: scope.scopeType, scopeId: scope.scopeId, ...data });
      continue;
    }

    const key = {
      tenantId_periodStart_periodEnd_scopeType_scopeId: {
        tenantId,
        periodStart: options.startDate,
        periodEnd: options.endDate,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
      },
    };
    const existing = await prisma.periodReport.findUnique({ where: key });

    if (existing && !options.correct) {
      console.log(`[Job E] ${scope.name}: já publicado em ${existing.publishedAt.toISOString()}; mantido sem alteração.`);
      result.skippedExisting++;
      continue;
    }

    if (existing && options.correct) {
      const { id: _id, ...snapshot } = existing as any;
      await prisma.$transaction([
        prisma.periodReportRevision.create({
          data: { reportId: existing.id, snapshot: JSON.parse(JSON.stringify(snapshot)), reason: options.reason!.trim() },
        }),
        prisma.periodReport.update({
          where: key,
          data: { ...data, correctedAt: new Date(), correctionReason: options.reason!.trim() },
        }),
      ]);
      result.corrected++;
    } else {
      await prisma.periodReport.create({
        data: {
          tenantId,
          periodStart: options.startDate,
          periodEnd: options.endDate,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          ...data,
        },
      });
      result.published++;
    }

    console.log(
      `[Job E] Relatório para ${scope.name} salvo. (Nota: ${qualidade.notaGeral ?? "—"}, n=${qualidade.n}, com nota=${qualidade.nComNota})`
    );
  }

  console.log(
    `[Job E] Concluído: ${result.published} publicados, ${result.skippedExisting} já existentes mantidos, ${result.corrected} corrigidos${options.dryRun ? `, ${result.drafts.length} rascunhos` : ""}.`
  );
  return result;
}
