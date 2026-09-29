export type LostClass = "counted" | "outOfControl" | "hygiene";

export interface LostReasonLists {
  outOfControl: string[]; // perda fora do controle do atendente (ex.: falta de peça no fornecedor)
  hygiene: string[]; // higienização (duplicado, já é cliente...)
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

export const parseList = (csv: string | null | undefined): string[] =>
  (csv ?? "").split(",").map(norm).filter(Boolean);

/** Casamento EXATO (normalizado), nunca por substring. Sem lista configurada, tudo conta. */
export function classifyLostReason(reason: string | null | undefined, lists: LostReasonLists): LostClass {
  if (!reason) return "counted";
  const r = norm(reason);
  if (lists.hygiene.includes(r)) return "hygiene";
  if (lists.outOfControl.includes(r)) return "outOfControl";
  return "counted";
}

export interface CardLike {
  status: string;
  lostReason?: string | null;
}

export interface CardTally {
  open: number;
  won: number;
  lost: number; // só perdas que contam contra a equipe
  lostOutOfControl: number;
  lostHygiene: number;
}

export function tallyCards(cards: CardLike[], lists: LostReasonLists): CardTally {
  const t: CardTally = { open: 0, won: 0, lost: 0, lostOutOfControl: 0, lostHygiene: 0 };
  for (const c of cards) {
    const status = c.status.toUpperCase();
    if (status === "WON") t.won++;
    else if (status === "LOST") {
      const k = classifyLostReason(c.lostReason, lists);
      if (k === "counted") t.lost++;
      else if (k === "outOfControl") t.lostOutOfControl++;
      else t.lostHygiene++;
    } else t.open++;
  }
  return t;
}

/** WON / (OPEN + WON + LOST contável). Perdas desconsideradas ficam fora do denominador. */
export function closingRate(t: CardTally): number | null {
  const total = t.open + t.won + t.lost;
  return total > 0 ? Number(((t.won / total) * 100).toFixed(1)) : null;
}
