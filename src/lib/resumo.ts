import { fmtNota } from "./format";
import { CRITERIOS } from "./labels";
import type { CriteriaScores, Granularidade } from "./types";

/** O critério de menor média entre os que têm nota; null quando nenhum tem. */
export function pontoMaisFraco(medias: CriteriaScores): { label: string; media: number } | null {
  let pior: { label: string; media: number } | null = null;
  for (const c of CRITERIOS) {
    const m = medias[c.key];
    if (m != null && (pior === null || m < pior.media)) pior = { label: c.label, media: m };
  }
  return pior;
}

/** "0,3 acima da semana anterior" / "Igual a agosto": a diferença de nota por extenso. */
export function textoComparacao(delta: number, tipo: Granularidade, mesAnterior?: string): string {
  const [com, igual] =
    tipo === "mes"
      ? mesAnterior
        ? [`de ${mesAnterior}`, `a ${mesAnterior}`]
        : ["do mês anterior", "ao mês anterior"]
      : ["da semana anterior", "à semana anterior"];
  if (delta === 0) return `Igual ${igual}`;
  return `${fmtNota(Math.abs(delta))} ${delta > 0 ? "acima" : "abaixo"} ${com}`;
}
