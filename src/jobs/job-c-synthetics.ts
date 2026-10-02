import { prisma } from "../db/prisma.js";
import { closingRate, parseList, tallyCards, type CardTally } from "../domain/lost-reasons.js";
import { computeSessionMetrics, mean, median } from "../domain/session-metrics.js";

/**
 * Métricas sintéticas do recorte (sem LLM). Valores `null` = sem dado para calcular
 * (nunca "0%" ou "100%" no lugar de "não sei").
 */
export interface SyntheticMetrics {
  n: number; // sessões iniciadas na janela (base de TMR, sem resposta e reativação)
  totalConversas: number;
  tmrMedioSegundos: number | null;
  tmrMedioFormatado: string;
  ftrMedianaSegundos: number | null;
  ftrMedianaFormatada: string;
  respClientePct: number | null;
  semRespostaPct: number | null;
  taxaFechamentoPct: number | null;
  reativacaoPct: number | null;
  wonCount?: number;
  lostCount?: number;
  openCount?: number;
  lostOutOfControlCount?: number;
  lostHygieneCount?: number;
  /** Quantas sessões tiveram TMR vindo do campo da sessão (sem mensagens no espelho). */
  tmrFallbackCount?: number;
}

export interface SyntheticFilter {
  tenantId: string;
  startDate: Date;
  endDate: Date;
  agentExternalId?: string;
  /** Sessões/cards ligados a QUALQUER um destes painéis (divisão = 2 painéis). */
  panelIds?: string[];
  /** Conversas que terminaram em QUALQUER uma destas equipes da FLW; cards ligados a elas (grupo de equipes). */
  departmentIds?: string[];
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || isNaN(seconds) || seconds < 0) return "N/D";
  const sec = Math.round(seconds);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remainingSec = sec % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSec}s`;
  return `${remainingSec}s`;
}

const pct = (count: number, total: number) => Number(((count / total) * 100).toFixed(1));

/**
 * Base de datas por métrica (PRD §6):
 *  - TMR, sem resposta, reativação: sessões INICIADAS na janela, qualquer status (operacional);
 *  - FTR: sessões COMPLETED que ENCERRARAM na janela;
 *  - Fechamento e funil: cards CRIADOS na janela, com o status ATUAL do card.
 */
export async function calculateSynthetics(filter: SyntheticFilter): Promise<SyntheticMetrics> {
  const { tenantId, startDate, endDate, agentExternalId, panelIds, departmentIds } = filter;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { ignoredLostReasons: true, hygieneLostReasons: true },
  });
  const lists = {
    outOfControl: parseList(tenant?.ignoredLostReasons),
    hygiene: parseList(tenant?.hygieneLostReasons),
  };

  const panelFilter = panelIds?.length ? { panelCards: { some: { panelId: { in: panelIds } } } } : {};
  const agentFilter = agentExternalId ? { agentExternalId } : {};
  const departmentFilter = departmentIds ? { departmentId: { in: departmentIds } } : {};

  // Operacional: iniciadas na janela
  const started = await prisma.session.findMany({
    where: { tenantId, startAt: { gte: startDate, lte: endDate }, ...agentFilter, ...panelFilter, ...departmentFilter },
    include: { messages: { orderBy: { timestamp: "asc" } } },
  });

  // FTR: encerradas na janela
  const finished = await prisma.session.findMany({
    where: {
      tenantId,
      status: "COMPLETED",
      endAt: { gte: startDate, lte: endDate },
      ...agentFilter,
      ...panelFilter,
      ...departmentFilter,
    },
    select: { status: true, startAt: true, endAt: true, timeService: true, firstResponseAt: true },
  });

  const tmr: number[] = [];
  let semResposta = 0;
  let reativadas = 0;
  let fallback = 0;
  for (const s of started) {
    const r = computeSessionMetrics(s, s.messages);
    if (r.tmrSeconds != null) tmr.push(r.tmrSeconds);
    if (r.tmrFromFallback) fallback++;
    if (r.semResposta) semResposta++;
    if (r.reativada) reativadas++;
  }

  const ftr = finished
    .map((s) => computeSessionMetrics(s, []).ftrSeconds)
    .filter((v): v is number => v != null);

  const n = started.length;
  const tmrMedioSegundos = mean(tmr);
  const ftrMedianaSegundos = median(ftr);
  const semRespostaPct = n > 0 ? pct(semResposta, n) : null;

  // Fechamento: cards criados na janela, status atual
  const cards = await prisma.panelCard.findMany({
    where: {
      tenantId,
      flwCreatedAt: { gte: startDate, lte: endDate },
      ...(panelIds?.length ? { panelId: { in: panelIds } } : {}),
      ...(agentExternalId ? { responsibleUserId: agentExternalId } : {}),
      ...(departmentIds ? { session: { departmentId: { in: departmentIds } } } : {}),
    },
    select: { status: true, lostReason: true },
  });
  const tally: CardTally = tallyCards(cards, lists);

  return {
    n,
    totalConversas: n,
    tmrMedioSegundos,
    tmrMedioFormatado: formatDuration(tmrMedioSegundos),
    ftrMedianaSegundos,
    ftrMedianaFormatada: formatDuration(ftrMedianaSegundos),
    respClientePct: semRespostaPct == null ? null : Number((100 - semRespostaPct).toFixed(1)),
    semRespostaPct,
    taxaFechamentoPct: closingRate(tally),
    reativacaoPct: n > 0 ? pct(reativadas, n) : null,
    wonCount: tally.won,
    lostCount: tally.lost,
    openCount: tally.open,
    lostOutOfControlCount: tally.lostOutOfControl,
    lostHygieneCount: tally.lostHygiene,
    tmrFallbackCount: fallback,
  };
}
