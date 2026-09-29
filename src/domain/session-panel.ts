export interface CardRef {
  panelId: string;
  panelTitle?: string | null;
  stepTitle?: string | null;
  status: string;
  flwUpdatedAt?: Date | null;
}

export interface SessionPanelInfo {
  /** null = sem esteira (sessão sem card em nenhum dos 4 painéis). */
  panelId: string | null;
  panelTitle: string | null;
  stepTitle: string | null;
  cardStatus: string | null;
  duplicateCards: number;
}

/**
 * Vínculo sessão → painel via card. Só cards dos painéis configurados contam.
 * Com mais de um card, usa o de `flwUpdatedAt` mais recente e informa a duplicidade.
 */
export function resolveSessionPanel(cards: CardRef[], tenantPanelIds: string[]): SessionPanelInfo {
  const own = cards.filter((c) => tenantPanelIds.includes(c.panelId));
  if (own.length === 0) {
    return { panelId: null, panelTitle: null, stepTitle: null, cardStatus: null, duplicateCards: 0 };
  }
  const best = [...own].sort(
    (a, b) => (b.flwUpdatedAt?.getTime() ?? 0) - (a.flwUpdatedAt?.getTime() ?? 0)
  )[0];
  return {
    panelId: best.panelId,
    panelTitle: best.panelTitle ?? null,
    stepTitle: best.stepTitle ?? null,
    cardStatus: best.status,
    duplicateCards: own.length - 1,
  };
}
