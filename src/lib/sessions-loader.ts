import type { Prisma } from "@/generated/client";
import { prisma } from "@/db/prisma";
import { anonymizeText } from "@/utils/anonymizer";
import { isClientMessage } from "@/domain/message-kind";
import { STAGE1_PROMPT_VERSION } from "@/domain/stage1";
import { env } from "@/config/env";
import { resolveTeams, scopeSessionFilter, type ReportScope } from "@/report/compute-scope";
import { META_NOTA } from "./labels";
import type { ContagensConversas, FaixaConversas, OrdemConversas, SessionDetail } from "./types";
import { loadTeamGroupMap } from "./teams-loader";

export const SESSIONS_PAGE_SIZE = 50;

export interface SessionsPage {
  sessions: SessionDetail[];
  /** Conversas do período com o filtro de faixa, não só as desta página. */
  total: number;
  /** Contagem de cada faixa, sem o filtro de faixa (mas com a busca e o atendente). */
  contagens: ContagensConversas;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type SessionRow = Prisma.SessionGetPayload<{ include: { panelCards: true } }> & {
  messages?: Prisma.SessionGetPayload<{ include: { messages: true } }>["messages"];
};
type AnalysisRow = Prisma.SessionAnalysisGetPayload<object> | undefined;

function toDetail(s: SessionRow, a: AnalysisRow, groupOf: Map<string, string>): SessionDetail {
  const ctx = { clientNames: [s.contactName, s.contactNameWhatsapp], clientPhone: s.contactPhone };
  const messages = (s.messages ?? []).map((m) => ({
    id: m.id,
    timestamp: m.timestamp.toISOString().substring(11, 16),
    direction: m.direction as "TO_HUB" | "FROM_HUB",
    origin: m.origin,
    sender: (isClientMessage(m) ? "cliente" : "operacao") as "cliente" | "operacao",
    text: anonymizeText(m.text || m.transcription || "", ctx) || "[Mídia sem texto]",
  }));

  const durationMinutes =
    s.startAt && s.endAt
      ? Math.round((s.endAt.getTime() - s.startAt.getTime()) / 60000)
      : s.timeService != null
        ? Math.round(s.timeService / 60)
        : null;

  const card = s.panelCards[0];

  return {
    id: s.externalId,
    number: s.number,
    agentName: s.agentName || "Não identificado",
    equipe: s.departmentId ? (groupOf.get(s.departmentId) ?? null) : null,
    contactName: "{{cliente}}",
    contactPhone: "{{fone}}",
    panelName: card ? card.stepTitle || "Sem etapa" : null,
    startAt: s.startAt?.toISOString() ?? null,
    endAt: s.endAt?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) ?? null,
    durationMinutes,
    status: s.status,
    notaConversa: a?.notaConversa ?? null,
    scores: {
      atrito: a?.scoreAtrito ?? null,
      solucao: a?.scoreSolucao ?? null,
      necessidade: a?.scoreNecessidade ?? null,
      proximoPasso: a?.scoreProximoPasso ?? null,
      resolvida: a?.scoreResolvida ?? null,
    },
    resumo1Linha: a?.resumo1Linha ?? null,
    evidencias: (a?.evidencias as Record<string, string> | null) ?? {},
    messages,
  };
}

/**
 * Filtro de sessões de um escopo do relatório (o mesmo do cálculo das notas). Escopo desconhecido devolve null:
 * a lista fica vazia em vez de mostrar conversas de outro lugar.
 */
async function loadScopeFilter(scopeType: string, scopeId: string): Promise<Prisma.SessionWhereInput | null> {
  if (scopeType === "geral") return {};
  if (scopeType === "agente") return scopeSessionFilter({ scopeType, scopeId, name: scopeId, agentExternalId: scopeId });
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return null;
  const scope: ReportScope = { scopeType: scopeType as ReportScope["scopeType"], scopeId, name: scopeId };
  if (scopeType === "divisao") {
    const ids = scopeId === "carros" ? [tenant.panelVendasId, tenant.panelCampanhasId] : scopeId === "pecas" ? [tenant.panelPecasId, tenant.panelOficinaId] : [];
    scope.panelIds = ids.filter((id): id is string => !!id);
    if (scope.panelIds.length === 0) return null;
  } else if (scopeType === "painel") {
    scope.panelIds = [scopeId];
  } else if (scopeType === "equipe") {
    const teams = await resolveTeams({ tenant, stage1PromptVersion: STAGE1_PROMPT_VERSION, minCoverage: env.CRITERION_MIN_COVERAGE });
    const ids = teams?.assignment.idsByGroup.get(scopeId);
    if (!ids?.length) return null;
    scope.departmentIds = ids;
  } else {
    return null;
  }
  return scopeSessionFilter(scope);
}

const FAIXA_WHERE: Record<FaixaConversas, Prisma.SessionAnalysisWhereInput> = {
  abaixo: { notaConversa: { lt: META_NOTA } },
  meta: { notaConversa: { gte: META_NOTA } },
  sem: { notaConversa: null },
};

/**
 * Conversas do período, com a mesma regra do relatório: encerradas na janela e com análise da versão atual.
 * A janela vem de quem chama (semana ou mês publicado, ou o intervalo livre). Uma página por vez, sem as mensagens.
 * `q` filtra por atendente ou equipe; `agente` pelo id do atendente (o `scopeId` do relatório).
 */
export async function loadAuditedSessions(options: {
  start: Date;
  end: Date;
  q?: string;
  /** Parte do nome do atendente. */
  agent?: string;
  /** Id do atendente (o `scopeId` do relatório). */
  agente?: string;
  /** Escopo do relatório (visão geral, divisão, equipe, painel ou atendente): a lista e as contagens ficam só dele. */
  scopeType?: string;
  scopeId?: string;
  faixa?: FaixaConversas;
  ordem?: OrdemConversas;
  offset?: number;
  limit?: number;
}): Promise<SessionsPage> {
  const groupOf = await loadTeamGroupMap();
  const q = options.q?.trim();
  const escopo = options.scopeType && options.scopeId ? await loadScopeFilter(options.scopeType, options.scopeId) : {};
  if (escopo === null) return { sessions: [], total: 0, contagens: { todas: 0, abaixo: 0, naMeta: 0, semNota: 0 } };

  const search: Prisma.SessionWhereInput[] = [];
  if (q) {
    const teamIds = [...groupOf].filter(([, group]) => norm(group).includes(norm(q))).map(([id]) => id);
    search.push({
      OR: [{ agentName: { contains: q, mode: "insensitive" } }, ...(teamIds.length ? [{ departmentId: { in: teamIds } }] : [])],
    });
  }
  const session: Prisma.SessionWhereInput = {
    status: "COMPLETED",
    endAt: { gte: options.start, lte: options.end },
    ...escopo,
    ...(options.agente ? { agentExternalId: options.agente } : {}),
    ...(options.agent ? { agentName: { contains: options.agent, mode: "insensitive" } } : {}),
    ...(search.length ? { AND: search } : {}),
  };
  const base: Prisma.SessionAnalysisWhereInput = { promptVersion: STAGE1_PROMPT_VERSION, status: "done", session };
  const where: Prisma.SessionAnalysisWhereInput = options.faixa ? { ...base, ...FAIXA_WHERE[options.faixa] } : base;

  const orderBy: Prisma.SessionAnalysisOrderByWithRelationInput[] =
    options.ordem === "nota"
      ? [{ notaConversa: { sort: "asc", nulls: "last" } }, { session: { endAt: "desc" } }, { id: "asc" }]
      : [{ session: { endAt: "desc" } }, { id: "asc" }];

  const [todas, abaixo, naMeta, semNota, rows] = await Promise.all([
    prisma.sessionAnalysis.count({ where: base }),
    prisma.sessionAnalysis.count({ where: { ...base, ...FAIXA_WHERE.abaixo } }),
    prisma.sessionAnalysis.count({ where: { ...base, ...FAIXA_WHERE.meta } }),
    prisma.sessionAnalysis.count({ where: { ...base, ...FAIXA_WHERE.sem } }),
    prisma.sessionAnalysis.findMany({
      where,
      include: { session: { include: { panelCards: true } } },
      orderBy,
      skip: Math.max(0, options.offset ?? 0),
      take: Math.min(options.limit ?? SESSIONS_PAGE_SIZE, 200),
    }),
  ]);

  const contagens: ContagensConversas = { todas, abaixo, naMeta, semNota };
  const total = options.faixa === "abaixo" ? abaixo : options.faixa === "meta" ? naMeta : options.faixa === "sem" ? semNota : todas;
  return { sessions: rows.map((r) => toDetail(r.session, r, groupOf)), total, contagens };
}

/**
 * Uma conversa com as mensagens, pelo id da FLW (a janela não conta): usada ao abrir a janela da conversa e nas
 * "conversas em destaque". Vale a análise da versão atual e, se não houver, a mais recente.
 */
export async function loadSessionById(externalId: string): Promise<SessionDetail | null> {
  const groupOf = await loadTeamGroupMap();
  const s = await prisma.session.findFirst({
    where: { externalId, status: "COMPLETED", analyses: { some: { status: "done" } } },
    include: {
      analyses: { where: { status: "done" }, orderBy: [{ analyzedAt: "desc" }] },
      messages: { orderBy: { timestamp: "asc" } },
      panelCards: true,
    },
  });
  if (!s) return null;
  const a = s.analyses.find((x) => x.promptVersion === STAGE1_PROMPT_VERSION) ?? s.analyses[0];
  return toDetail(s, a, groupOf);
}
