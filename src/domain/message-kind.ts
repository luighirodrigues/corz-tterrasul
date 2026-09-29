/**
 * Fonte única de verdade sobre "quem falou" numa thread da FLW.
 *
 * ATENÇÃO: `direction` é do ponto de vista do canal WhatsApp (o "hub"), NÃO da loja.
 * Confirmado nos dados reais do tenant:
 *  - FROM_HUB = chega do canal = fala do CLIENTE (origin GATEWAY);
 *  - TO_HUB   = a loja envia ao canal = atendente, bot, campanha...
 *
 * Entre as mensagens que a loja envia (TO_HUB), a origem diz quem foi:
 *  - DEFAULT: atendente pelo painel da FLW;
 *  - GATEWAY: atendente digitando direto no WhatsApp (celular/Web) — também é humano;
 *  - BOT, CAMPAIGN, OFFICE_HOURS, PAYMENT, API: automáticas
 *    (D3: `API` tratada como automática até confirmar que nenhum atendente envia por integração).
 */
export interface MessageLike {
  direction: string;
  origin: string;
  type: string;
  status?: string | null;
}

export const AUTOMATED_ORIGINS = new Set(["BOT", "OFFICE_HOURS", "CAMPAIGN", "PAYMENT", "API"]);
export const HUMAN_ORIGINS = new Set(["DEFAULT", "GATEWAY"]);
/** Tipos que não são fala na conversa (o cliente não os vê). */
export const NON_CONVERSATION_TYPES = new Set(["TRANSITION", "TRACK", "NOTE"]);
export const FAILED_STATUSES = new Set(["FAILED", "DELETED"]);

export const isConversationMessage = (m: MessageLike): boolean =>
  !NON_CONVERSATION_TYPES.has(m.type) && !FAILED_STATUSES.has(m.status ?? "");

export const isInternalNote = (m: MessageLike): boolean => m.type === "NOTE";

/** Fala do cliente: o que chega do canal. */
export const isClientMessage = (m: MessageLike): boolean =>
  m.direction === "FROM_HUB" && isConversationMessage(m);

/** Mensagem que a loja enviou por automação (bot, campanha, fora do horário...). */
export const isAutomatedMessage = (m: MessageLike): boolean =>
  m.direction === "TO_HUB" && isConversationMessage(m) && AUTOMATED_ORIGINS.has(m.origin);

/** Resposta de atendente humano (painel da FLW ou digitada direto no WhatsApp). */
export const isHumanOperatorMessage = (m: MessageLike): boolean =>
  m.direction === "TO_HUB" && isConversationMessage(m) && HUMAN_ORIGINS.has(m.origin);
