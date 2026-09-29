export const CRITERIA = ["atrito", "solucao", "necessidade", "proximoPasso", "resolvida"] as const;
export type Criterion = (typeof CRITERIA)[number];

export const CRITERION_LABEL: Record<Criterion, string> = {
  atrito: "Pouco ou nenhum atrito",
  solucao: "Apresentou solução",
  necessidade: "Entendeu a necessidade",
  proximoPasso: "Próximo passo combinado",
  resolvida: "Conversa resolvida",
};

/** Análise de uma sessão (estágio 1) já com status `done`. Notas 0–10 ou null (não se aplica). */
export interface AnalysisRow {
  scores: Record<Criterion, number | null>;
  resumo?: string | null;
  evidencias?: Record<string, string> | null;
}

export interface Counts {
  aplicavel: number;
  baixo_0_4: number;
  medio_5_7: number;
  alto_8_10: number;
}

export interface Qualidade {
  n: number; // sessões COMPLETED do recorte
  nDone: number;
  nComNota: number;
  nSkipped: number;
  nError: number;
  nSemEsteira: number;
  notaGeral: number | null;
  medias: Record<Criterion, number | null>;
  histograma: number[]; // 11 posições (0–10)
  contagens: Record<Criterion, Counts | null>; // null = critério indisponível
  criteriosIndisponiveis: Criterion[];
}

export interface AggregateOptions {
  /** Cobertura mínima (fração de conversas em que o critério se aplica) para entrar na nota. */
  minCoverage: number;
  n: number;
  nSkipped: number;
  nError: number;
  nSemEsteira: number;
}

const round1 = (x: number) => Number(x.toFixed(1));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function unavailableCriteria(rows: AnalysisRow[], minCoverage: number): Criterion[] {
  if (rows.length === 0) return [];
  return CRITERIA.filter((c) => rows.filter((r) => r.scores[c] != null).length / rows.length < minCoverage);
}

/** Nota de uma conversa usando só os critérios disponíveis na leva (pesos redistribuídos). */
export function conversationScore(row: AnalysisRow, available: readonly Criterion[]): number | null {
  const vals = available.map((c) => row.scores[c]).filter((v): v is number => v != null);
  return avg(vals);
}

/**
 * Agrega as análises de um recorte. A nota é calculada do zero, só entre conversas COM nota
 * (conversa sem nenhum critério aplicável não puxa a média para baixo).
 */
export function aggregateQuality(rows: AnalysisRow[], opts: AggregateOptions): Qualidade {
  const unavailable = unavailableCriteria(rows, opts.minCoverage);
  const available = CRITERIA.filter((c) => !unavailable.includes(c));

  const notas = rows.map((r) => conversationScore(r, available)).filter((v): v is number => v != null);

  const histograma = new Array(11).fill(0);
  for (const nota of notas) histograma[Math.min(10, Math.max(0, Math.round(nota)))]++;

  const medias = {} as Record<Criterion, number | null>;
  const contagens = {} as Record<Criterion, Counts | null>;
  for (const c of CRITERIA) {
    if (unavailable.includes(c)) {
      medias[c] = null;
      contagens[c] = null;
      continue;
    }
    const vals = rows.map((r) => r.scores[c]).filter((v): v is number => v != null);
    const m = avg(vals);
    medias[c] = m == null ? null : round1(m);
    contagens[c] = {
      aplicavel: vals.length,
      baixo_0_4: vals.filter((v) => v <= 4).length,
      medio_5_7: vals.filter((v) => v > 4 && v < 8).length,
      alto_8_10: vals.filter((v) => v >= 8).length,
    };
  }

  const geral = avg(notas);
  return {
    n: opts.n,
    nDone: rows.length,
    nComNota: notas.length,
    nSkipped: opts.nSkipped,
    nError: opts.nError,
    nSemEsteira: opts.nSemEsteira,
    notaGeral: geral == null ? null : round1(geral),
    medias,
    histograma,
    contagens,
    criteriosIndisponiveis: unavailable,
  };
}

export const isPreliminary = (q: Pick<Qualidade, "nComNota">, min = 10) => q.nComNota < min;

export interface SampleCase {
  id: string; // c01…: id curto, nunca o id real da sessão
  nota: number;
  resumo: string;
  scores: Record<Criterion, number | null>;
  evidencias: Record<string, string>;
}

/**
 * Amostra de casos para o estágio 2: metade entre as piores notas e metade entre as melhores
 * (não "as 10 primeiras que o banco devolver").
 */
export function pickCases(rows: AnalysisRow[], available: readonly Criterion[], max = 10): SampleCase[] {
  const scored = rows
    .map((r) => ({ r, nota: conversationScore(r, available) }))
    .filter((x): x is { r: AnalysisRow; nota: number } => x.nota != null && !!x.r.resumo);
  if (scored.length === 0) return [];

  const sorted = [...scored].sort((a, b) => a.nota - b.nota);
  const half = Math.floor(max / 2);
  const worst = sorted.slice(0, half);
  const best = sorted.slice(-half).filter((x) => !worst.includes(x));
  const picked = [...worst, ...best];
  // Poucos casos: completa com o que sobrou
  for (const x of sorted) {
    if (picked.length >= Math.min(max, sorted.length)) break;
    if (!picked.includes(x)) picked.push(x);
  }

  return picked.map((x, i) => ({
    id: `c${String(i + 1).padStart(2, "0")}`,
    nota: Number(x.nota.toFixed(1)),
    resumo: x.r.resumo ?? "",
    scores: x.r.scores,
    evidencias: x.r.evidencias ?? {},
  }));
}
