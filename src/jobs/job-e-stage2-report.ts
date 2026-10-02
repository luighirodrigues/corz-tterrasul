import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { runJobMetrics } from "./job-metrics.js";
import { STAGE1_PROMPT_VERSION } from "../domain/stage1.js";
import { checkPublishGate } from "../domain/publish-gate.js";
import { previousOf, weeksOfMonth, type Granularity, type Period } from "../domain/period.js";
import { ensureTenant } from "../domain/tenant.js";
import { CRITERION_LABEL, pickCases, type Criterion } from "../domain/aggregate.js";
import { DateTime } from "luxon";
import {
  buildScopes,
  collectQuality,
  computeScope,
  resolveTeams,
  type ReportScope,
  type ScopeContext,
} from "../report/compute-scope.js";
import { withTemperature } from "../domain/openai-params.js";
import {
  buildStage2Input,
  buildStage2MesInput,
  finalizeStage2,
  STAGE2_MAX_CASES,
  STAGE2_MES_PROMPT_VERSION,
  STAGE2_MES_SYSTEM_PROMPT,
  STAGE2_PROMPT_VERSION,
  STAGE2_SYSTEM_PROMPT,
  textosPublicados,
  type SemanaPublicada,
  stage2JsonSchema,
  type RawStage2Output,
} from "../domain/stage2.js";

export { STAGE2_PROMPT_VERSION, STAGE2_MES_PROMPT_VERSION };

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

export type { ReportScope };

export interface RunStage2Options {
  tenantId?: string;
  startDate: Date;
  endDate: Date;
  /** `semana` (padrão) ou `mes`: muda o texto da IA, a comparação e o que fica gravado em `granularity`. */
  granularity?: Extract<Granularity, "semana" | "mes">;
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
  granularity: string;
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
  const granularity = options.granularity ?? "semana";
  const isMonth = granularity === "mes";
  const promptVersion = options.promptVersion || (isMonth ? STAGE2_MES_PROMPT_VERSION : STAGE2_PROMPT_VERSION);
  const model = env.OPENAI_MODEL_STAGE2 || "gpt-4.1";

  if (options.correct && !options.reason?.trim()) {
    throw new Error('--correct exige --reason "texto".');
  }

  const tenant = await ensureTenant(tenantId);
  const ctx: ScopeContext = { tenant, stage1PromptVersion: STAGE1_PROMPT_VERSION, minCoverage: env.CRITERION_MIN_COVERAGE };

  // Trava de publicação (checklist §16)
  const period: Period = { start: options.startDate, end: options.endDate, label: "", granularity };
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

  // Mês que começa antes do go-live sai parcial, com aviso (D5). O mês anterior parcial não gera seta (D6).
  const dataDesde = (d: Date) => DateTime.fromJSDate(d, { zone: tenant.timezone }).toFormat("dd/MM/yyyy");
  const startsBeforeGoLive = (p: { start: Date }) => !!tenant.goLiveAt && tenant.goLiveAt.getTime() > p.start.getTime();
  if (isMonth && startsBeforeGoLive(period)) {
    gateLimitations.push(`Dados a partir de ${dataDesde(tenant.goLiveAt!)}: o mês está incompleto.`);
  }

  const result: Stage2Result = { drafts: [], published: 0, skippedExisting: 0, corrected: 0 };
  const openai = env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: env.OPENAI_TIMEOUT_STAGE2_MS, maxRetries: 3 })
    : null;

  console.log(`[Job E] Iniciando relatórios do período: ${options.startDate.toISOString()} até ${options.endDate.toISOString()}`);

  // 1. Escopos. Equipe com configuração malformada falha aqui, antes de gravar qualquer relatório.
  const teams = await resolveTeams(ctx);
  const { scopes, warnings: scopeWarnings } = await buildScopes(ctx, { start: options.startDate, end: options.endDate }, teams);
  for (const w of scopeWarnings) console.warn(`[Job E] ${w}`);

  console.log(`[Job E] Serão gerados ${scopes.length} relatórios por escopo.`);

  /** Textos já publicados nas semanas do mês para o escopo: contexto para a IA apontar o que se repetiu (D4). */
  async function semanasPublicadas(scope: ReportScope, mes: Period): Promise<SemanaPublicada[]> {
    const weeks = weeksOfMonth(mes, tenant.timezone, tenant.periodWeekStart);
    const rows = await prisma.periodReport.findMany({
      where: {
        tenantId,
        granularity: "semana",
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        periodStart: { in: weeks.map((w) => w.start) },
      },
      select: { periodStart: true, textoFortes: true, textoOps: true },
      orderBy: { periodStart: "asc" },
    });
    const label = new Map(weeks.map((w) => [w.start.getTime(), w.label]));
    return rows.map((r) => ({
      semana: label.get(r.periodStart.getTime()) ?? r.periodStart.toISOString(),
      pontos_fortes: textosPublicados(r.textoFortes),
      oportunidades: textosPublicados(r.textoOps),
    }));
  }

  const reportKey = (scope: ReportScope) => ({
    tenantId_periodStart_periodEnd_scopeType_scopeId: {
      tenantId,
      periodStart: options.startDate,
      periodEnd: options.endDate,
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
    },
  });

  for (const scope of scopes) {
    // Já publicado: não gasta análise nem IA à toa (o relatório publicado nunca é refeito sem --correct).
    if (!options.dryRun && !options.correct) {
      const done = await prisma.periodReport.findUnique({ where: reportKey(scope), select: { publishedAt: true } });
      if (done) {
        console.log(`[Job E] ${scope.name}: já publicado em ${done.publishedAt.toISOString()}; mantido sem alteração.`);
        result.skippedExisting++;
        continue;
      }
    }
    console.log(`[Job E] Processando escopo: [${scope.scopeType}] ${scope.name} (${scope.scopeId})...`);
    const limitations: string[] = [...gateLimitations];

    const computed = await computeScope(ctx, scope, { start: options.startDate, end: options.endDate }, teams);
    const { sinteticos, qualidade, funil, rows, preliminar } = computed;

    // Evolução: período anterior (semana ou mês) RECALCULADO com a régua atual (mesmos critérios), só para a seta.
    // O ponto histórico do período anterior (linha publicada) não é tocado.
    let comparativo: unknown = null;
    {
      const prevP = previousOf(period, tenant.timezone);
      const availableNow = (Object.keys(CRITERION_LABEL) as Criterion[]).filter((c) => qualidade.contagens[c]);
      const prev = await collectQuality(ctx, scope, prevP, availableNow);
      const coverage = prev.qualidade.n > 0 ? prev.qualidade.nDone / prev.qualidade.n : 0;
      if (isMonth && startsBeforeGoLive(prevP)) {
        if (qualidade.notaGeral != null && prev.qualidade.n > 0) {
          limitations.push(`Sem comparação com o mês anterior: ele é parcial (dados a partir de ${dataDesde(tenant.goLiveAt!)}).`);
        }
      } else if (qualidade.notaGeral != null && prev.qualidade.notaGeral != null && coverage >= 0.8) {
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
          `Sem comparação com ${isMonth ? "o mês" : "a semana"} anterior: só ${fmtPct(coverage)} das conversas ${isMonth ? "dele" : "dela"} têm análise na versão atual.`
        );
      }
    }

    // IA estágio 2: recebe contagens já calculadas; o número do bullet vem do código
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
        const kpis = {
          tmr: sinteticos.tmrMedioFormatado,
          sem_resposta_pct: sinteticos.semRespostaPct,
          fechamento_pct: sinteticos.taxaFechamentoPct,
        };
        const input = isMonth
          ? buildStage2MesInput(
              scope.name,
              qualidade,
              kpis,
              pickCases(rows, available, STAGE2_MAX_CASES.mes),
              await semanasPublicadas(scope, period)
            )
          : buildStage2Input(scope.name, qualidade, kpis, pickCases(rows, available, STAGE2_MAX_CASES.semana));

        const comp = await withTemperature(model, 0.3, (temperature) =>
          openai.chat.completions.create({
            model,
            ...(temperature !== undefined ? { temperature } : {}),
            messages: [
              { role: "system", content: isMonth ? STAGE2_MES_SYSTEM_PROMPT : STAGE2_SYSTEM_PROMPT },
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

    // Limitações declaradas (nunca escondidas)
    limitations.push(...computed.limitacoes);

    // Persistir (imutável): só cria; correção é explícita e deixa revisão
    const data = {
      sinteticos: sinteticos as any,
      qualidade: qualidade as any,
      funil: funil as any,
      textoFortes: textoFortes as any,
      textoOps: textoOps as any,
      preliminar,
      limitacoes: limitations.length ? limitations.join("\n") : null,
      comparativo: comparativo as any,
      granularity,
      promptVersionSintese: promptVersion,
      model,
    };

    if (options.dryRun) {
      result.drafts.push({ scopeType: scope.scopeType, scopeId: scope.scopeId, ...data });
      continue;
    }

    const key = reportKey(scope);
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
