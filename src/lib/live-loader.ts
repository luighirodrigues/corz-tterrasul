import { DateTime } from "luxon";
import { env } from "@/config/env";
import { prisma } from "@/db/prisma";
import { CRITERION_LABEL, pickHighlights, type Criterion } from "@/domain/aggregate";
import { parseFreePeriod } from "@/domain/period";
import { STAGE1_PROMPT_VERSION } from "@/domain/stage1";
import { buildScopes, computeScope, resolveTeams, type ScopeContext } from "@/report/compute-scope";
import type { ReportItem } from "./types";
import { toReportItems, type ReportRowLike } from "./reports-loader";

/** Quantos escopos são calculados ao mesmo tempo (o pool do banco aguenta, e cada um é só leitura). */
const CONCURRENCY = 6;

export class FreePeriodError extends Error {}

/** Valida as datas do período livre no fuso do tenant (L-D4). Lança `FreePeriodError` com mensagem para o gestor. */
export async function resolveFreePeriod(de: string, ate: string, now: Date = new Date()) {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return null;
  try {
    return { tenant, free: parseFreePeriod({ de, ate, now, tz: tenant.timezone, goLiveAt: tenant.goLiveAt }) };
  } catch (err) {
    throw new FreePeriodError(err instanceof Error ? err.message : "Período inválido.");
  }
}

/**
 * Relatório de um intervalo qualquer (L-D1): calculado na hora com as MESMAS regras do relatório publicado
 * (`computeScope`), sem texto da IA, sem comparação e sem gravar nada.
 */
export async function loadLiveReports(de: string, ate: string, now: Date = new Date()): Promise<ReportItem[]> {
  const resolved = await resolveFreePeriod(de, ate, now);
  if (!resolved) return [];
  const { tenant, free } = resolved;
  const { period } = free;
  const window = { start: period.start, end: period.end };

  const ctx: ScopeContext = { tenant, stage1PromptVersion: STAGE1_PROMPT_VERSION, minCoverage: env.CRITERION_MIN_COVERAGE };
  const teams = await resolveTeams(ctx);
  const { scopes } = await buildScopes(ctx, window, teams);

  const [lastSync, stale] = await Promise.all([
    prisma.syncJob.findFirst({
      where: { tenantId: tenant.id, jobType: "SYNC_SESSIONS", status: "completed" },
      orderBy: { startedAt: "desc" },
      select: { finishedAt: true },
    }),
    prisma.session.count({
      where: { tenantId: tenant.id, metricsStale: true, startAt: { gte: window.start, lte: window.end } },
    }),
  ]);
  const dadosAte = lastSync?.finishedAt?.toISOString() ?? null;

  const avisos: string[] = [];
  if (free.adjustedToGoLive && tenant.goLiveAt) {
    const desde = DateTime.fromJSDate(tenant.goLiveAt, { zone: tenant.timezone }).toFormat("dd/MM/yyyy");
    avisos.push(`O período começa antes dos dados: contado a partir de ${desde}.`);
  }
  if (stale > 0) {
    avisos.push(`${stale} conversas com indicadores em atualização; o número de 1ª resposta pode mudar em alguns minutos.`);
  }

  const extras = new Map<string, Pick<ReportItem, "semAvaliacao" | "destaques">>();
  const rows: ReportRowLike[] = [];

  for (let i = 0; i < scopes.length; i += CONCURRENCY) {
    const batch = scopes.slice(i, i + CONCURRENCY);
    const computed = await Promise.all(batch.map((scope) => computeScope(ctx, scope, window, teams)));
    batch.forEach((scope, k) => {
      const c = computed[k];
      const id = `livre:${scope.scopeType}:${scope.scopeId}`;
      const available = (Object.keys(CRITERION_LABEL) as Criterion[]).filter((cr) => c.qualidade.contagens[cr]);
      extras.set(id, { semAvaliacao: c.nPending, destaques: pickHighlights(c.rows, available, 3) });
      rows.push({
        id,
        granularity: "livre",
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        periodStart: period.start,
        periodEnd: period.end,
        preliminar: c.preliminar,
        limitacoes: [...avisos, ...c.limitacoes].join("\n") || null,
        qualidade: c.qualidade,
        sinteticos: c.sinteticos,
        funil: c.funil,
        textoFortes: null, // sem IA no período livre (L-D2)
        textoOps: null,
        model: null,
        promptVersionSintese: null,
        comparativo: null, // sem seta (L-D3)
        correctedAt: null,
        correctionReason: null,
      });
    });
  }

  const items = await toReportItems(rows);
  return items.map((it) => ({ ...it, calculadoAgora: true, dadosAte, ...extras.get(it.id) }));
}
