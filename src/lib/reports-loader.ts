import { DateTime } from "luxon";
import { prisma } from "@/db/prisma";
import { resolveScopeTitle } from "@/domain/scope-title";
import type { ReportItem, ScopeType } from "./types";
import { loadAgentTeams, loadTeamGroupMap } from "./teams-loader";

export interface PeriodOption {
  start: string;
  end: string;
}

const isoDay = (d: Date) => d.toISOString().split("T")[0];

export async function listPublishedPeriods(): Promise<PeriodOption[]> {
  const rows = await prisma.periodReport.findMany({
    where: { scopeType: "geral" },
    select: { periodStart: true, periodEnd: true },
    orderBy: { periodStart: "desc" },
  });
  return rows.map((r) => ({ start: r.periodStart.toISOString(), end: r.periodEnd.toISOString() }));
}

/** Relatórios de uma janela (start ISO). Sem `periodStart`, usa a última janela publicada. */
export async function loadReports(periodStart?: string): Promise<ReportItem[]> {
  let start: Date | undefined = periodStart ? new Date(periodStart) : undefined;
  if (start && isNaN(start.getTime())) throw new Error("period inválido");

  if (!start) {
    const latest = await prisma.periodReport.findFirst({
      orderBy: { periodStart: "desc" },
      select: { periodStart: true },
    });
    if (!latest) return [];
    start = latest.periodStart;
  }

  const [rows, tenant, agents] = await Promise.all([
    prisma.periodReport.findMany({ where: { periodStart: start } }),
    prisma.tenant.findFirst(),
    // scopeId do atendente = userId da sessão (≠ do id de cadastro em `agents`): o nome vem das sessões.
    prisma.session.findMany({
      where: { agentExternalId: { not: null }, agentName: { not: null } },
      select: { agentExternalId: true, agentName: true },
      distinct: ["agentExternalId"],
    }),
  ]);
  const agentNames = new Map(agents.map((a) => [a.agentExternalId as string, a.agentName as string]));
  const agentTeams = rows.length
    ? await loadAgentTeams({ start, end: rows[0].periodEnd }, await loadTeamGroupMap())
    : new Map<string, string>();

  const order: Record<string, number> = { geral: 1, divisao: 2, equipe: 3, painel: 4, agente: 5 };

  return rows
    .map((r): ReportItem => {
      const q = r.qualidade as any;
      const { title } = resolveScopeTitle(r, tenant, agentNames);
      return {
        id: r.id,
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
