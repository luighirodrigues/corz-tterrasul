import {
  isClientMessage,
  isConversationMessage,
  isHumanOperatorMessage,
  type MessageLike,
} from "./message-kind.js";

export interface TimedMessage extends MessageLike {
  timestamp: Date;
}

export interface SessionLike {
  status: string;
  startAt: Date | null;
  endAt: Date | null;
  firstResponseAt: Date | null;
  timeService: number | null;
}

export interface SessionMetrics {
  /** Segundos da 1ª fala do cliente até a 1ª resposta humana; null se não dá para medir. */
  tmrSeconds: number | null;
  /** true quando o TMR veio de `firstResponseAt - startAt` (sem mensagens no espelho). */
  tmrFromFallback: boolean;
  /** Cliente falou e ficou sem resposta humana (definição D2). */
  semResposta: boolean;
  /** Após ≥ 24h de silêncio, a próxima fala foi humana. */
  reativada: boolean;
  /** Duração até fechar (só COMPLETED). */
  ftrSeconds: number | null;
}

export const REACTIVATION_GAP_HOURS = 24;

const t = (d: Date) => new Date(d).getTime();

/**
 * Métricas sintéticas de UMA sessão, a partir da thread (não só de `timeWait`).
 * `messages` deve estar ordenada por timestamp crescente.
 *
 * Sem resposta (D2): o cliente escreveu e
 *  (a) nunca houve resposta humana depois da 1ª fala dele; ou
 *  (b) a sessão NÃO está concluída e a última fala do cliente é posterior à última fala humana.
 * Uma sessão COMPLETED que termina com "ok, obrigado" do cliente não conta.
 */
export function computeSessionMetrics(session: SessionLike, messages: TimedMessage[]): SessionMetrics {
  const conv = messages.filter(isConversationMessage);
  const client = conv.filter(isClientMessage);
  const human = conv.filter(isHumanOperatorMessage);

  let tmrSeconds: number | null = null;
  let tmrFromFallback = false;
  let semResposta = false;

  if (messages.length === 0) {
    // Sem thread no espelho: usa os campos da sessão e sinaliza.
    if (session.firstResponseAt && session.startAt) {
      tmrSeconds = Math.max(0, (t(session.firstResponseAt) - t(session.startAt)) / 1000);
      tmrFromFallback = true;
    }
    semResposta = !session.firstResponseAt;
  } else if (client.length > 0) {
    const firstClient = t(client[0].timestamp);
    const firstReply = human.find((m) => t(m.timestamp) >= firstClient);
    if (firstReply) tmrSeconds = Math.max(0, (t(firstReply.timestamp) - firstClient) / 1000);

    const lastClient = t(client[client.length - 1].timestamp);
    const lastHuman = human.length ? t(human[human.length - 1].timestamp) : null;
    const neverAnswered = !firstReply;
    const pendingNow = session.status !== "COMPLETED" && (lastHuman === null || lastClient > lastHuman);
    semResposta = neverAnswered || pendingNow;
  }
  // Sem fala do cliente (atendimento iniciado pela loja): TMR e sem-resposta não se aplicam.

  let reativada = false;
  for (let i = 1; i < conv.length; i++) {
    const gapHours = (t(conv[i].timestamp) - t(conv[i - 1].timestamp)) / 3_600_000;
    if (gapHours >= REACTIVATION_GAP_HOURS && isHumanOperatorMessage(conv[i])) {
      reativada = true;
      break;
    }
  }

  let ftrSeconds: number | null = null;
  if (session.status === "COMPLETED") {
    if (session.startAt && session.endAt) ftrSeconds = Math.max(0, (t(session.endAt) - t(session.startAt)) / 1000);
    else if (session.timeService != null) ftrSeconds = session.timeService;
  }

  return { tmrSeconds, tmrFromFallback, semResposta, reativada, ftrSeconds };
}

export function median(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function mean(numbers: number[]): number | null {
  return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
}
