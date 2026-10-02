import type { Prisma } from "@/generated/client";
import { prisma } from "@/db/prisma";
import { anonymizeText } from "@/utils/anonymizer";
import { isClientMessage } from "@/domain/message-kind";
import type { SessionDetail } from "./types";
import { loadTeamGroupMap } from "./teams-loader";

export const SESSIONS_PAGE_SIZE = 50;

export interface SessionsPage {
  sessions: SessionDetail[];
  /** Total de conversas avaliadas no período (com o filtro), não só as desta página. */
  total: number;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Conversas avaliadas de uma janela, da mais recente para a mais antiga, em páginas.
 * A janela vem de quem chama: a semana ou o mês publicado, ou o intervalo livre.
 * `q` filtra por atendente ou equipe.
 */
export async function loadAuditedSessions(options: {
  start: Date;
  end: Date;
  q?: string;
  agent?: string;
  /** Uma conversa só, pelo id da FLW (ignora a janela): usado nas "conversas em destaque". */
  externalId?: string;
  offset?: number;
  limit?: number;
}): Promise<SessionsPage> {
  const groupOf = await loadTeamGroupMap();
  const q = options.q?.trim();

  const search: Prisma.SessionWhereInput[] = [];
  if (q) {
    const teamIds = [...groupOf].filter(([, group]) => norm(group).includes(norm(q))).map(([id]) => id);
    search.push({
      OR: [{ agentName: { contains: q, mode: "insensitive" } }, ...(teamIds.length ? [{ departmentId: { in: teamIds } }] : [])],
    });
  }
  const where: Prisma.SessionWhereInput = {
    status: "COMPLETED",
    ...(options.externalId ? { externalId: options.externalId } : { endAt: { gte: options.start, lte: options.end } }),
    analyses: { some: { status: "done" } },
    ...(options.agent ? { agentName: { contains: options.agent, mode: "insensitive" } } : {}),
    ...(search.length ? { AND: search } : {}),
  };

  const [total, dbSessions] = await Promise.all([
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      include: {
        analyses: { where: { status: "done" }, orderBy: { analyzedAt: "desc" }, take: 1 },
        messages: { orderBy: { timestamp: "asc" } },
        panelCards: true,
      },
      orderBy: [{ endAt: "desc" }, { id: "asc" }],
      skip: Math.max(0, options.offset ?? 0),
      take: Math.min(options.limit ?? SESSIONS_PAGE_SIZE, 200),
    }),
  ]);

  const sessions = dbSessions.map((s) => {
    const a = s.analyses[0];
    const ctx = { clientNames: [s.contactName, s.contactNameWhatsapp], clientPhone: s.contactPhone };
    const msgs = s.messages.map((m) => ({
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
      panelName: card ? card.stepTitle || "Sem etapa" : "sem esteira",
      startAt: s.startAt?.toLocaleDateString("pt-BR") ?? null,
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
      messages: msgs,
    };
  });

  return { sessions, total };
}
