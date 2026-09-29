import { prisma } from "@/db/prisma";
import { anonymizeText } from "@/utils/anonymizer";
import type { SessionDetail } from "./types";

export async function loadAuditedSessions(agentSlug?: string): Promise<SessionDetail[]> {
  const dbSessions = await prisma.session.findMany({
    where: {
      status: "COMPLETED",
      analyses: { some: { status: "done" } },
      ...(agentSlug ? { agentName: { contains: agentSlug, mode: "insensitive" as const } } : {}),
    },
    include: {
      analyses: { where: { status: "done" }, orderBy: { analyzedAt: "desc" }, take: 1 },
      messages: { orderBy: { timestamp: "asc" } },
      panelCards: true,
    },
    orderBy: { endAt: "desc" },
    take: 50,
  });

  return dbSessions.map((s) => {
    const a = s.analyses[0];
    const ctx = { clientNames: [s.contactName, s.contactNameWhatsapp], clientPhone: s.contactPhone };
    const msgs = s.messages.map((m) => ({
      id: m.id,
      timestamp: m.timestamp.toISOString().substring(11, 16),
      direction: m.direction as "TO_HUB" | "FROM_HUB",
      origin: m.origin,
      sender: (m.direction === "TO_HUB" ? "cliente" : "operacao") as "cliente" | "operacao",
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
}
