import { prisma } from "../db/prisma.js";

export interface SyntheticMetrics {
  n: number;
  totalConversas: number;
  tmrMedioSegundos: number | null; // TMR médio em segundos
  tmrMedioFormatado: string;       // ex: "4m 12s"
  ftrMedianaSegundos: number | null; // FTR mediana em segundos
  ftrMedianaFormatada: string;     // ex: "1h 45m"
  respClientePct: number;          // ex: 79.2 (%)
  semRespostaPct: number;          // ex: 20.8 (%)
  taxaFechamentoPct: number | null;// ex: 18.5 (%)
  reativacaoPct: number;           // ex: 12.4 (%)
  wonCount?: number;
  lostCount?: number;
  openCount?: number;
}

export interface SyntheticFilter {
  tenantId: string;
  startDate: Date;
  endDate: Date;
  agentExternalId?: string;
  panelId?: string;
  departmentId?: string;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || isNaN(seconds) || seconds < 0) return "N/D";
  const sec = Math.round(seconds);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remainingSec = sec % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSec}s`;
  }
  return `${remainingSec}s`;
}

function calculateMedian(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export async function calculateSynthetics(filter: SyntheticFilter): Promise<SyntheticMetrics> {
  const { tenantId, startDate, endDate, agentExternalId, panelId } = filter;

  // 1. Obter tenant para verificar motivos de perda desconsiderados
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { ignoredLostReasons: true },
  });
  const ignoredReasons = (tenant?.ignoredLostReasons || "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // 2. Buscar sessões do período
  const sessionWhere: any = {
    tenantId,
    startAt: {
      gte: startDate,
      lte: endDate,
    },
  };

  if (agentExternalId) {
    sessionWhere.agentExternalId = agentExternalId;
  }

  // Se houver filtro de painel, filtrar apenas sessões ligadas a cards desse painel
  if (panelId) {
    sessionWhere.panelCards = {
      some: {
        panelId,
      },
    };
  }

  const sessions = await prisma.session.findMany({
    where: sessionWhere,
    include: {
      messages: {
        orderBy: { timestamp: "asc" },
      },
    },
  });

  const n = sessions.length;
  if (n === 0) {
    return {
      n: 0,
      totalConversas: 0,
      tmrMedioSegundos: null,
      tmrMedioFormatado: "0s",
      ftrMedianaSegundos: null,
      ftrMedianaFormatada: "0s",
      respClientePct: 100,
      semRespostaPct: 0,
      taxaFechamentoPct: null,
      reativacaoPct: 0,
    };
  }

  // 3. TMR Médio e Detecção de Sem Resposta pela timeline de mensagens
  const tmrList: number[] = [];
  let semRespostaCount = 0;
  let reativacaoCount = 0;

  for (const session of sessions) {
    const msgs = session.messages;

    // A. Cálculo de TMR pela timeline
    // Procura a primeira mensagem do cliente (TO_HUB) e a primeira resposta humana subsequente (FROM_HUB, origin != BOT)
    let firstClientMsgTime: number | null = null;
    let firstHumanReplyTime: number | null = null;

    for (const msg of msgs) {
      const msgTime = new Date(msg.timestamp).getTime();
      if (msg.direction === "TO_HUB") {
        if (firstClientMsgTime === null) {
          firstClientMsgTime = msgTime;
        }
      } else if (msg.direction === "FROM_HUB" && msg.origin !== "BOT") {
        if (firstClientMsgTime !== null && firstHumanReplyTime === null) {
          firstHumanReplyTime = msgTime;
          break;
        }
      }
    }

    if (firstClientMsgTime !== null && firstHumanReplyTime !== null) {
      const diffSec = Math.max(0, (firstHumanReplyTime - firstClientMsgTime) / 1000);
      tmrList.push(diffSec);
    } else if (session.firstResponseAt && session.startAt) {
      // Fallback para campos da sessão
      const diffSec = Math.max(0, (new Date(session.firstResponseAt).getTime() - new Date(session.startAt).getTime()) / 1000);
      tmrList.push(diffSec);
    }

    // B. Sem resposta: cliente falou e não houve resposta humana, ou última mensagem é do cliente
    if (msgs.length > 0) {
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg.direction === "TO_HUB") {
        semRespostaCount++;
      } else if (firstClientMsgTime !== null && firstHumanReplyTime === null) {
        semRespostaCount++;
      }
    } else if (!session.firstResponseAt) {
      semRespostaCount++;
    }

    // C. Reativação: gap >= 24h na timeline seguido de FROM_HUB
    let hasReactivation = false;
    for (let i = 1; i < msgs.length; i++) {
      const prevTime = new Date(msgs[i - 1].timestamp).getTime();
      const currTime = new Date(msgs[i].timestamp).getTime();
      const gapHours = (currTime - prevTime) / (1000 * 3600);

      if (gapHours >= 24 && msgs[i].direction === "FROM_HUB") {
        hasReactivation = true;
        break;
      }
    }
    if (hasReactivation) {
      reativacaoCount++;
    }
  }

  const tmrMedioSegundos = tmrList.length > 0 ? tmrList.reduce((acc, v) => acc + v, 0) / tmrList.length : null;

  // 4. FTR Mediana (tempo até fechar o atendimento em sessões COMPLETED)
  const ftrDurations: number[] = [];
  for (const session of sessions) {
    if (session.status === "COMPLETED" && session.startAt && session.endAt) {
      const durationSec = Math.max(0, (new Date(session.endAt).getTime() - new Date(session.startAt).getTime()) / 1000);
      ftrDurations.push(durationSec);
    } else if (session.status === "COMPLETED" && session.timeService) {
      ftrDurations.push(session.timeService);
    }
  }
  const ftrMedianaSegundos = calculateMedian(ftrDurations);

  // 5. Sem resposta % e Resp. cliente %
  const semRespostaPct = Number(((semRespostaCount / n) * 100).toFixed(1));
  const respClientePct = Number((100 - semRespostaPct).toFixed(1));
  const reativacaoPct = Number(((reativacaoCount / n) * 100).toFixed(1));

  // 6. Taxa de fechamento a partir dos cards CRM
  const cardWhere: any = {
    tenantId,
    flwCreatedAt: {
      gte: startDate,
      lte: endDate,
    },
  };

  if (panelId) {
    cardWhere.panelId = panelId;
  }
  if (agentExternalId) {
    cardWhere.responsibleUserId = agentExternalId;
  }

  const cards = await prisma.panelCard.findMany({
    where: cardWhere,
    select: { status: true, lostReason: true },
  });

  let wonCount = 0;
  let lostCount = 0;
  let openCount = 0;

  for (const card of cards) {
    const statusUpper = card.status.toUpperCase();
    if (statusUpper === "WON") {
      wonCount++;
    } else if (statusUpper === "LOST") {
      // Regra de justiça: ignorar perda se for motivo fora do controle do atendente
      const reasonLower = (card.lostReason || "").toLowerCase();
      const isIgnored = ignoredReasons.some((ig) => reasonLower.includes(ig));
      if (!isIgnored) {
        lostCount++;
      }
    } else {
      openCount++;
    }
  }

  const totalCardsConsiderados = wonCount + lostCount + openCount;
  const taxaFechamentoPct =
    totalCardsConsiderados > 0 ? Number(((wonCount / totalCardsConsiderados) * 100).toFixed(1)) : null;

  return {
    n,
    totalConversas: n,
    tmrMedioSegundos,
    tmrMedioFormatado: formatDuration(tmrMedioSegundos),
    ftrMedianaSegundos,
    ftrMedianaFormatada: formatDuration(ftrMedianaSegundos),
    respClientePct,
    semRespostaPct,
    taxaFechamentoPct,
    reativacaoPct,
    wonCount,
    lostCount,
    openCount,
  };
}
