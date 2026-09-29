/**
 * Alguns modelos (família de raciocínio, ex.: gpt-5/gpt-6) só aceitam a temperatura padrão e
 * respondem 400 se mandarmos outra. O PRD pede 0 (estágio 1) e 0,3 (estágio 2) para quem aceita;
 * para quem não aceita, repete sem `temperature` e lembra da recusa para as próximas chamadas.
 */
const rejectsTemperature = new Set<string>();

export function isTemperatureError(err: any): boolean {
  const msg = String(err?.message ?? "");
  return (err?.status === 400 || /^400\b/.test(msg)) && /temperature/i.test(msg);
}

export async function withTemperature<T>(
  model: string,
  wanted: number,
  create: (temperature: number | undefined) => Promise<T>
): Promise<T> {
  if (rejectsTemperature.has(model)) return create(undefined);
  try {
    return await create(wanted);
  } catch (err) {
    if (!isTemperatureError(err)) throw err;
    console.warn(`[OpenAI] O modelo ${model} não aceita temperature=${wanted}; usando o padrão dele.`);
    rejectsTemperature.add(model);
    return create(undefined);
  }
}
