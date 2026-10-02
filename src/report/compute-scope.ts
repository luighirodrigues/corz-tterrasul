import type { Tenant } from "../generated/client/index.js";
import { prisma } from "../db/prisma";
import { aggregateQuality, CRITERION_LABEL, type AnalysisRow, type Criterion, type Qualidade } from "../domain/aggregate";
import { parseList, tallyCards } from "../domain/lost-reasons";
import { resolveSessionPanel } from "../domain/session-panel";
import { assignTeamGroups, countUnassigned, parseIgnoredTeams, parseTeamGroups, type TeamAssignment } from "../domain/teams";
import { calculateSynthetics, type SyntheticMetrics } from "../jobs/job-c-synthetics";

/**
 * Cálculo de UM escopo (geral, divisão, equipe, painel, atendente) numa janela qualquer.
 * Usado pelo Job E (relatório publicado) e pela tela (período livre): as duas coisas têm de dar os mesmos números.
 *
 * Importado também pelo Next: sem `env` e sem módulos pesados (OpenAI); a configuração vem em `ScopeContext`.
 * Os imports daqui (e dos módulos que ele alcança) NÃO levam a extensão `.js`: o Next não resolve `./x.js` para `./x.ts`.
 * `tests/web-imports.test.ts` vigia isso.
 */

export interface ReportScope {
  scopeType: "geral" | "divisao" | "equipe" | "painel" | "agente";
  scopeId: string;
  name: string;
  panelIds?: string[];
  /** Equipe = grupo de equipes da FLW (TEAM_GROUPS): ids da FLW que contam nele. */
  departmentIds?: string[];
  agentExternalId?: string;
}

export interface ScopeWindow {
  start: Date;
  end: Date;
}

export interface ScopeContext {
  tenant: Tenant;
  /** Versão do prompt do estágio 1 cujas análises valem. */
  stage1PromptVersion: string;
  /** Cobertura mínima de um critério para entrar na nota (`CRITERION_MIN_COVERAGE`). */
  minCoverage: number;
}

export interface TeamsInfo {
  assignment: TeamAssignment;
  /** Ids de todas as equipes da FLW sincronizadas. */
  knownIds: Set<string>;
}

export interface FunilData {
  etapas: Record<string, number>;
  open: number;
  won: number;
  lost: number;
  lostReasons: Record<string, number>;
  desconsideradas: { foraDoControle: number; higienizacao: number };
}

export interface ScopeComputation {
  sinteticos: SyntheticMetrics;
  qualidade: Qualidade;
  funil: FunilData | null;
  /** Avisos sobre os dados (conversas fora da nota, sem esteira, critérios fora da nota...). */
  limitacoes: string[];
  preliminar: boolean;
  rows: AnalysisRow[];
  /** Conversas encerradas na janela que ainda não foram avaliadas (a análise roda de madrugada). */
  nPending: number;
}

const fmtPct = (x: number) => `${Math.round(x * 100)}%`;

export const tenantPanelIds = (t: Tenant): string[] =>
  [t.panelVendasId, t.panelCampanhasId, t.panelPecasId, t.panelOficinaId].filter((id): id is string => !!id);

/** Grupos de equipes. Configuração malformada lança aqui, antes de qualquer relatório ser gravado. */
export async function resolveTeams(ctx: ScopeContext): Promise<TeamsInfo | null> {
  const groups = parseTeamGroups(ctx.tenant.teamGroups);
  if (groups.length === 0) return null;
  const departments = await prisma.department.findMany({
    where: { tenantId: ctx.tenant.id },
    select: { externalId: true, name: true },
  });
  return {
    assignment: assignTeamGroups(
      departments.map((d) => ({ id: d.externalId, name: d.name })),
      groups,
      parseIgnoredTeams(ctx.tenant.ignoredTeams),
    ),
    knownIds: new Set(departments.map((d) => d.externalId)),
  };
}

/** Os escopos com relatório na janela: geral, divisões, equipes, painéis e os atendentes que tiveram conversa nela. */
export async function buildScopes(
  ctx: ScopeContext,
  window: ScopeWindow,
  teams: TeamsInfo | null,
): Promise<{ scopes: ReportScope[]; warnings: string[] }> {
  const { tenant } = ctx;
  const warnings: string[] = [];
  const scopes: ReportScope[] = [{ scopeType: "geral", scopeId: "geral", name: "Visão Geral da Operação" }];

  const carPanels = [tenant.panelVendasId, tenant.panelCampanhasId].filter((id): id is string => !!id);
  if (carPanels.length > 0) {
    scopes.push({ scopeType: "divisao", scopeId: "carros", name: "Venda de Veículos", panelIds: carPanels });
  }
  const partsPanels = [tenant.panelPecasId, tenant.panelOficinaId].filter((id): id is string => !!id);
  if (partsPanels.length > 0) {
    scopes.push({ scopeType: "divisao", scopeId: "pecas", name: "Peças e Oficina", panelIds: partsPanels });
  }

  // Equipes: um relatório por grupo do TEAM_GROUPS.
  if (teams) {
    for (const g of parseTeamGroups(tenant.teamGroups)) {
      const ids = teams.assignment.idsByGroup.get(g.name)!;
      if (ids.length === 0) {
        warnings.push(`Equipe "${g.name}": nenhuma equipe da FLW sincronizada com esses nomes; sem relatório (rode o sync).`);
        continue;
      }
      scopes.push({ scopeType: "equipe", scopeId: g.name, name: `Equipe ${g.name}`, departmentIds: ids });
    }
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
      tenantId: tenant.id,
      agentExternalId: { not: null },
      OR: [
        { status: "COMPLETED", endAt: { gte: window.start, lte: window.end } },
        { startAt: { gte: window.start, lte: window.end } },
      ],
    },
    select: { agentExternalId: true, agentName: true },
    distinct: ["agentExternalId"],
    orderBy: { agentExternalId: "asc" },
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

  return { scopes, warnings };
}

/** Filtro de sessões de um escopo (o mesmo do Job C). */
export function scopeSessionFilter(scope: ReportScope) {
  return {
    ...(scope.agentExternalId ? { agentExternalId: scope.agentExternalId } : {}),
    ...(scope.panelIds?.length ? { panelCards: { some: { panelId: { in: scope.panelIds } } } } : {}),
    ...(scope.departmentIds ? { departmentId: { in: scope.departmentIds } } : {}),
  };
}

/** Qualidade do escopo numa janela: sessões COMPLETED encerradas nela (M13). */
export async function collectQuality(
  ctx: ScopeContext,
  scope: ReportScope,
  window: ScopeWindow,
  forceAvailable?: readonly Criterion[],
) {
  const sessions = await prisma.session.findMany({
    where: {
      tenantId: ctx.tenant.id,
      status: "COMPLETED",
      endAt: { gte: window.start, lte: window.end },
      ...scopeSessionFilter(scope),
    },
    include: {
      analyses: { where: { promptVersion: ctx.stage1PromptVersion } },
      panelCards: { select: { panelId: true, panelTitle: true, stepTitle: true, status: true, flwUpdatedAt: true } },
    },
  });
  const panelIds = tenantPanelIds(ctx.tenant);

  const rows: AnalysisRow[] = [];
  let nSkipped = 0;
  let nError = 0;
  let nPending = 0;
  let nSemEsteira = 0;
  let nDuplicateCards = 0;

  for (const s of sessions) {
    const info = resolveSessionPanel(s.panelCards, panelIds);
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
        sessionExternalId: s.externalId,
        agentName: s.agentName,
      });
    } else if (s.analyses.some((x) => x.status === "skipped")) nSkipped++;
    else if (s.analyses.some((x) => x.status === "error")) nError++;
    else nPending++;
  }

  const qualidade = aggregateQuality(rows, {
    minCoverage: ctx.minCoverage,
    n: sessions.length,
    nSkipped,
    nError,
    nSemEsteira: scope.panelIds ? 0 : nSemEsteira,
    forceAvailable,
  });
  return { sessions, rows, qualidade, nSkipped, nError, nPending, nSemEsteira, nDuplicateCards };
}

/** Indicadores, qualidade, funil e avisos de um escopo na janela. Sem IA e sem gravar nada. */
export async function computeScope(
  ctx: ScopeContext,
  scope: ReportScope,
  window: ScopeWindow,
  teams: TeamsInfo | null,
): Promise<ScopeComputation> {
  const { tenant } = ctx;
  const lists = { outOfControl: parseList(tenant.ignoredLostReasons), hygiene: parseList(tenant.hygieneLostReasons) };

  const { sessions, rows, qualidade, nSkipped, nError, nPending, nSemEsteira, nDuplicateCards } = await collectQuality(
    ctx,
    scope,
    window,
  );
  const preliminar = qualidade.nComNota < 10;

  // Sintéticos (Job C) com os mesmos painéis do escopo
  const sinteticos = await calculateSynthetics({
    tenantId: tenant.id,
    startDate: window.start,
    endDate: window.end,
    agentExternalId: scope.agentExternalId,
    panelIds: scope.panelIds,
    departmentIds: scope.departmentIds,
  });

  // Funil CRM (cards criados na janela; status ATUAL do card)
  let funil: FunilData | null = null;
  if (scope.panelIds && scope.panelIds.length > 0) {
    const cards = await prisma.panelCard.findMany({
      where: {
        tenantId: tenant.id,
        panelId: { in: scope.panelIds },
        flwCreatedAt: { gte: window.start, lte: window.end },
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

  // Limitações declaradas (nunca escondidas)
  const limitacoes: string[] = [];
  if (preliminar) {
    limitacoes.push(`Amostra preliminar: ${qualidade.nComNota} conversas com nota (mínimo 10).`);
  }
  if (nSkipped || nError || nPending) {
    const parts = [
      nSkipped ? `${nSkipped} puladas (sem fala humana)` : "",
      nError ? `${nError} com erro de análise` : "",
      nPending ? `${nPending} ainda sem análise` : "",
    ].filter(Boolean);
    limitacoes.push(`Conversas fora da nota: ${parts.join(", ")}.`);
  }
  if (!scope.panelIds && nSemEsteira > 0) {
    limitacoes.push(`${nSemEsteira} de ${sessions.length} conversas sem card (sem esteira).`);
  }
  for (const c of qualidade.criteriosIndisponiveis) {
    const cover = rows.length ? rows.filter((r) => r.scores[c] != null).length / rows.length : 0;
    limitacoes.push(`Critério "${CRITERION_LABEL[c]}" fora da nota: aplicável em ${fmtPct(cover)} das conversas.`);
  }
  if (scope.scopeType === "geral" && teams) {
    const unassigned = countUnassigned(sessions, teams.assignment, teams.knownIds);
    if (unassigned.length > 0) {
      const total = unassigned.reduce((sum, u) => sum + u.count, 0);
      limitacoes.push(
        `${total} conversas não entram em nenhuma equipe: ${unassigned.map((u) => `${u.name} (${u.count})`).join(", ")}.`,
      );
    }
  }
  if (nDuplicateCards > 0) limitacoes.push(`${nDuplicateCards} sessões com mais de um card; usado o mais recente.`);
  if (sinteticos.tmrFallbackCount) {
    limitacoes.push(`TMR de ${sinteticos.tmrFallbackCount} conversas veio do campo da sessão (sem mensagens no espelho).`);
  }
  if (funil) limitacoes.push("Funil usa o status atual dos cards, não o status no fim da janela.");

  return { sinteticos, qualidade, funil, limitacoes, preliminar, rows, nPending };
}
