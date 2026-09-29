export interface Prices {
  inputPer1M: number; // US$ por 1M de tokens de entrada
  outputPer1M: number;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

export const pricesConfigured = (p: Prices) => p.inputPer1M > 0 || p.outputPer1M > 0;

export function costUsd(usage: Usage | undefined | null, prices: Prices): number {
  if (!usage) return 0;
  return (
    ((usage.prompt_tokens ?? 0) * prices.inputPer1M + (usage.completion_tokens ?? 0) * prices.outputPer1M) / 1_000_000
  );
}

/** Backoff entre corridas para sessões com erro: 30min, 1h, 2h, 4h... até 24h. */
export function nextRetryDelayMinutes(attempts: number): number {
  return Math.min(24 * 60, 30 * 2 ** Math.max(0, attempts - 1));
}
