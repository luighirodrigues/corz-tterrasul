import { prisma } from "@/db/prisma";
import { assignTeamGroups, parseIgnoredTeams, parseTeamGroups } from "@/domain/teams";

/**
 * Equipe da FLW (id) → grupo do relatório. Configuração inválida ou equipes ainda não sincronizadas
 * devolvem mapa vazio: a tela funciona como antes, só sem as equipes.
 */
export async function loadTeamGroupMap(): Promise<Map<string, string>> {
  try {
    const tenant = await prisma.tenant.findFirst({ select: { id: true, teamGroups: true, ignoredTeams: true } });
    if (!tenant) return new Map();
    const groups = parseTeamGroups(tenant.teamGroups);
    if (groups.length === 0) return new Map();
    const departments = await prisma.department.findMany({
      where: { tenantId: tenant.id },
      select: { externalId: true, name: true },
    });
    return assignTeamGroups(
      departments.map((d) => ({ id: d.externalId, name: d.name })),
      groups,
      parseIgnoredTeams(tenant.ignoredTeams),
    ).groupOf;
  } catch (err) {
    console.warn("[teams-loader] Equipes indisponíveis:", err instanceof Error ? err.message : err);
    return new Map();
  }
}

/**
 * Equipe principal de cada atendente na semana: o grupo com mais conversas concluídas dele.
 * Empate: o primeiro em ordem alfabética.
 */
export async function loadAgentTeams(
  period: { start: Date; end: Date },
  groupOf: Map<string, string>,
): Promise<Map<string, string>> {
  if (groupOf.size === 0) return new Map();
  const rows = await prisma.session.groupBy({
    by: ["agentExternalId", "departmentId"],
    where: {
      status: "COMPLETED",
      endAt: { gte: period.start, lte: period.end },
      agentExternalId: { not: null },
      departmentId: { not: null },
    },
    _count: { _all: true },
  });

  const perAgent = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const group = groupOf.get(r.departmentId as string);
    if (!group) continue;
    const counts = perAgent.get(r.agentExternalId as string) ?? new Map<string, number>();
    counts.set(group, (counts.get(group) ?? 0) + r._count._all);
    perAgent.set(r.agentExternalId as string, counts);
  }

  const main = new Map<string, string>();
  for (const [agent, counts] of perAgent) {
    const best = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    main.set(agent, best[0]);
  }
  return main;
}
