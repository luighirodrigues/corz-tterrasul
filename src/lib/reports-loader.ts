import { DateTime } from "luxon";
import { prisma } from "@/db/prisma";
import { monthContaining, weeksOfMonth } from "@/domain/period";
import { resolveScopeTitle } from "@/domain/scope-title";
import type { Granularidade, ReportItem, ScopeType, TipoPublicado } from "./types";
import { loadAgentTeams, loadTeamGroupMap } from "./teams-loader";

export interface PeriodOption {
  start: string;
  end: string;
  granularity: TipoPublicado;
}

const isoDay = (d: Date) => d.toISOString().split("T")[0];

/** Lê o parâmetro `tipo` da API: semana (padrão) ou mês. */
export function parseTipo(raw: string | null | undefined): TipoPublicado {
  return raw === "mes" ? "mes" : "semana";
}

/** Janelas publicadas de um tipo, da mais recente para a mais antiga. Semana e mês nunca se misturam. */
export async function listPublishedPeriods(tipo: TipoPublicado = "semana"): Promise<PeriodOption[]> {
  const rows = await prisma.periodReport.findMany({
    where: { scopeType: "geral", granularity: tipo },
    select: { periodStart: true, periodEnd: true },
    orderBy: { periodStart: "desc" },
  });
  return rows.map((r) => ({ start: r.periodStart.toISOString(), end: r.periodEnd.toISOString(), granularity: tipo }));
}

/** Janela publicada: a do `periodStart` informado ou, sem ele, a mais recente do tipo. */
export async function resolvePublishedWindow(
  tipo: TipoPublicado,
  periodStart?: string
): Promise<{ start: Date; end: Date } | null> {
  const start = periodStart ? new Date(periodStart) : undefined;
  if (start && isNaN(start.getTime())) throw new Error("period inválido");
  const row = await prisma.periodReport.findFirst({
    where: { granularity: tipo, ...(start ? { periodStart: start } : {}) },
    orderBy: { periodStart: "desc" },
    select: { periodStart: true, periodEnd: true },
  });
  return row ? { start: row.periodStart, end: row.periodEnd } : null;
}

/** O que um relatório precisa para virar `ReportItem`: o mesmo formato serve ao publicado e ao calculado na hora. */
export interface ReportRowLike {
  id: string;
  granularity: string;
  scopeType: string;
  scopeId: string;
  periodStart: Date;
  periodEnd: Date;
  preliminar: boolean;
  limitacoes: string | null;
  qualidade: unknown;
  sinteticos: unknown;
  funil: unknown;
  textoFortes: unknown;
  textoOps: unknown;
  model: string | null;
  promptVersionSintese: string | null;
  comparativo: unknown;
  correctedAt: Date | null;
  correctionReason: string | null;
}

/** Nomes dos atendentes: o scopeId é o userId da sessão (≠ do id de cadastro em `agents`), então o nome vem das sessões. */
export async function loadAgentNames(): Promise<Map<string, string>> {
  const agents = await prisma.session.findMany({
    where: { agentExternalId: { not: null }, agentName: { not: null } },
    select: { agentExternalId: true, agentName: true },
    distinct: ["agentExternalId"],
  });
  return new Map(agents.map((a) => [a.agentExternalId as string, a.agentName as string]));
}

export async function toReportItems(rows: ReportRowLike[]): Promise<ReportItem[]> {
  if (rows.length === 0) return [];
  const [tenant, agentNames] = await Promise.all([prisma.tenant.findFirst(), loadAgentNames()]);
  const agentTeams = await loadAgentTeams({ start: rows[0].periodStart, end: rows[0].periodEnd }, await loadTeamGroupMap());

  const order: Record<string, number> = { geral: 1, divisao: 2, equipe: 3, painel: 4, agente: 5 };

  return rows
    .map((r): ReportItem => {
      const q = r.qualidade as any;
      const { title } = resolveScopeTitle(r, tenant, agentNames);
      return {
        id: r.id,
        granularity: r.granularity as Granularidade,
        title,
        slug: `${r.scopeType}_${r.scopeId}`,
        scopeType: r.scopeType as ScopeType,
        scopeId: r.scopeId,
        equipe: r.scopeType === "agente" ? (agentTeams.get(r.scopeId) ?? null) : undefined,
        periodStart: isoDay(r.periodStart),
        // O fim da janela é 23:59 de São Paulo; em UTC já é o dia seguinte.
        periodEnd: DateTime.fromJSDate(r.periodEnd, { zone: "America/Sao_Paulo" }).toISODate() as string,
        preliminar: r.preliminar,
        limitacoes: r.limitacoes,
        notaGeral: q?.notaGeral ?? null,
        totalConversas: q?.nComNota ?? q?.n ?? 0, // conversas com nota (base do anel)
        medias: q?.medias ?? {},
        histograma: q?.histograma ?? new Array(11).fill(0),
        sinteticos: r.sinteticos as any,
        funil: r.funil as any,
        textoFortes: (r.textoFortes as any[] | null) ?? null,
        textoOps: (r.textoOps as any[] | null) ?? null,
        model: r.model,
        promptVersionSintese: r.promptVersionSintese,
        comparativo: (r.comparativo as any) ?? null,
        correctedAt: r.correctedAt ? r.correctedAt.toISOString() : null,
        correctionReason: r.correctionReason,
      };
    })
    .sort((a, b) => {
      if (order[a.scopeType] !== order[b.scopeType]) return order[a.scopeType] - order[b.scopeType];
      return (b.notaGeral ?? -1) - (a.notaGeral ?? -1);
    });
}

/** Relatórios publicados de uma janela (start ISO) do tipo pedido. Sem `periodStart`, a última janela publicada desse tipo. */
export async function loadReports(tipo: TipoPublicado = "semana", periodStart?: string): Promise<ReportItem[]> {
  const window = await resolvePublishedWindow(tipo, periodStart);
  if (!window) return [];
  const rows = await prisma.periodReport.findMany({ where: { granularity: tipo, periodStart: window.start } });
  return toReportItems(rows);
}

export interface WeekOfMonth {
  periodStart: string;
  periodEnd: string;
  /** Há relatório semanal publicado para esta semana. */
  publicada: boolean;
  notaGeral: number | null;
  n: number;
  preliminar: boolean;
}

/**
 * As semanas que pertencem a um mês (D7) com a nota OFICIAL de cada uma, como foi publicada
 * (não é recalculada nem a média: a nota do mês é calculada de todas as conversas do mês).
 */
export async function loadWeeksOfMonth(
  monthStart: string,
  scope: { scopeType: string; scopeId: string }
): Promise<WeekOfMonth[]> {
  const tenant = await prisma.tenant.findFirst({ select: { timezone: true, periodWeekStart: true } });
  const tz = tenant?.timezone ?? "America/Sao_Paulo";
  // "YYYY-MM-DD" é uma data local (ao meio-dia, para não cair no dia anterior em UTC); ISO com hora vale como está.
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(monthStart)
    ? DateTime.fromISO(monthStart, { zone: tz }).plus({ hours: 12 }).toJSDate()
    : new Date(monthStart);
  if (isNaN(ref.getTime())) throw new Error("period inválido");
  const weeks = weeksOfMonth(monthContaining(ref, tz), tz, tenant?.periodWeekStart ?? 3);

  const rows = await prisma.periodReport.findMany({
    where: {
      granularity: "semana",
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      periodStart: { in: weeks.map((w) => w.start) },
    },
    select: { periodStart: true, qualidade: true, preliminar: true },
  });
  const byStart = new Map(rows.map((r) => [r.periodStart.getTime(), r]));

  return weeks.map((w) => {
    const r = byStart.get(w.start.getTime());
    const q = r?.qualidade as any;
    return {
      periodStart: w.start.toISOString(),
      periodEnd: w.end.toISOString(),
      publicada: !!r,
      notaGeral: q?.notaGeral ?? null,
      n: q?.nComNota ?? q?.n ?? 0,
      preliminar: r?.preliminar ?? false,
    };
  });
}
