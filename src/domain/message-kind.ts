/**
 * Fonte única de verdade sobre "quem falou" numa thread da FLW.
 *
 * A API tem várias origens automáticas além de BOT:
 * DEFAULT | CAMPAIGN | OFFICE_HOURS | BOT | API | PAYMENT | GATEWAY.
 * Só `DEFAULT` conta como atendente humano (decisão D3: `API` tratada como automática
 * até confirmar que nenhum atendente envia por integração).
 */
export interface MessageLike {
  direction: string; // TO_HUB (cliente) | FROM_HUB (operação)
  origin: string;
  type: string;
  status?: string | null;
}

export const AUTOMATED_ORIGINS = new Set(["BOT", "OFFICE_HOURS", "CAMPAIGN", "PAYMENT", "GATEWAY", "API"]);
/** Tipos que não são fala na conversa (o cliente não os vê). */
export const NON_CONVERSATION_TYPES = new Set(["TRANSITION", "TRACK", "NOTE"]);
export const FAILED_STATUSES = new Set(["FAILED", "DELETED"]);

export const isConversationMessage = (m: MessageLike): boolean =>
  !NON_CONVERSATION_TYPES.has(m.type) && !FAILED_STATUSES.has(m.status ?? "");

export const isInternalNote = (m: MessageLike): boolean => m.type === "NOTE";

export const isClientMessage = (m: MessageLike): boolean =>
  m.direction === "TO_HUB" && isConversationMessage(m);

export const isAutomatedMessage = (m: MessageLike): boolean =>
  m.direction === "FROM_HUB" && isConversationMessage(m) && AUTOMATED_ORIGINS.has(m.origin);

export const isHumanOperatorMessage = (m: MessageLike): boolean =>
  m.direction === "FROM_HUB" && isConversationMessage(m) && !AUTOMATED_ORIGINS.has(m.origin);
