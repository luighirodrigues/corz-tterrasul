import { anonymizeText } from "../utils/anonymizer.js";
import { CRITERIA, CRITERION_LABEL, type Criterion, type Qualidade, type SampleCase } from "./aggregate.js";

export const STAGE2_PROMPT_VERSION = "stage2-v2";
/** Texto do relatório MENSAL: mais casos e, como contexto, os pontos já publicados nas semanas do mês. */
export const STAGE2_MES_PROMPT_VERSION = "stage2-mes-v1";
/** Casos de amostra por escopo: semana 10, mês 20. */
export const STAGE2_MAX_CASES = { semana: 10, mes: 20 } as const;

export type Faixa = "alto" | "baixo";

/** Item como a IA devolve: ela escolhe critério e faixa; o SISTEMA preenche os números. */
export interface RawStage2Item {
  criterio: Criterion;
  faixa: Faixa;
  texto: string; // com marcadores {n_casos} e {n_total}
  script_sugerido: string | null;
}

export interface RawStage2Output {
  pontos_fortes: RawStage2Item[];
  oportunidades: RawStage2Item[];
}

/** Item gravado em texto_fortes / texto_ops (formato do PRD + critério/faixa). */
export interface Stage2Item {
  criterio: Criterion;
  faixa: Faixa;
  n_casos: number;
  n_total: number;
  texto: string;
  script_sugerido: string | null;
}

export interface Stage2Input {
  escopo: string;
  n_conversas_com_nota: number;
  nota_geral: number | null;
  medias: Qualidade["medias"];
  histograma: number[];
  contagens: Qualidade["contagens"];
  top_gaps: Array<{ criterio: Criterion; rotulo: string; n_baixo: number; n_aplicavel: number }>;
  top_fortes: Array<{ criterio: Criterion; rotulo: string; n_alto: number; n_aplicavel: number }>;
  criterios_indisponiveis: Criterion[];
  kpis: Record<string, string | number | null>;
  casos: SampleCase[];
}

/** O que a IA já escreveu para uma semana do mês (só os textos; os números do item não vão). */
export interface SemanaPublicada {
  semana: string; // "2026-09-02 a 2026-09-08"
  pontos_fortes: string[];
  oportunidades: string[];
}

export interface Stage2MesInput extends Stage2Input {
  periodo: "mes";
  semanas_publicadas: SemanaPublicada[];
}

export function buildStage2MesInput(
  escopo: string,
  q: Qualidade,
  kpis: Stage2Input["kpis"],
  casos: SampleCase[],
  semanas: SemanaPublicada[]
): Stage2MesInput {
  return { ...buildStage2Input(escopo, q, kpis, casos), periodo: "mes", semanas_publicadas: semanas };
}

/** Extrai os textos de `texto_fortes` / `texto_ops` já publicados (JSON do banco) para o contexto do mês. */
export function textosPublicados(items: unknown, max = 4): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => (i && typeof i === "object" ? (i as { texto?: unknown }).texto : null))
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .slice(0, max);
}

export function buildStage2Input(
  escopo: string,
  q: Qualidade,
  kpis: Stage2Input["kpis"],
  casos: SampleCase[]
): Stage2Input {
  const avail = CRITERIA.filter((c) => q.contagens[c]);
  const gaps = avail
    .map((c) => ({ criterio: c, rotulo: CRITERION_LABEL[c], n_baixo: q.contagens[c]!.baixo_0_4, n_aplicavel: q.contagens[c]!.aplicavel }))
    .filter((x) => x.n_baixo > 0)
    .sort((a, b) => b.n_baixo - a.n_baixo)
    .slice(0, 3);
  const fortes = avail
    .map((c) => ({ criterio: c, rotulo: CRITERION_LABEL[c], n_alto: q.contagens[c]!.alto_8_10, n_aplicavel: q.contagens[c]!.aplicavel }))
    .filter((x) => x.n_alto > 0)
    .sort((a, b) => b.n_alto - a.n_alto)
    .slice(0, 3);

  return {
    escopo,
    n_conversas_com_nota: q.nComNota,
    nota_geral: q.notaGeral,
    medias: q.medias,
    histograma: q.histograma,
    contagens: q.contagens,
    top_gaps: gaps,
    top_fortes: fortes,
    criterios_indisponiveis: q.criteriosIndisponiveis,
    kpis,
    casos,
  };
}

// Quantidade de conversas escrita pela IA (ex.: "6 das", "em 7 conversas"). Só os marcadores são permitidos.
const INVENTED_COUNT = /\b\d+\s*(?:das|dos|de|conversas?|casos?|atendimentos?|clientes?|vezes)\b/i;

export interface FinalizeResult {
  fortes: Stage2Item[];
  oportunidades: Stage2Item[];
  descartes: string[];
}

function finalizeItems(
  items: RawStage2Item[],
  section: Faixa,
  q: Qualidade,
  descartes: string[]
): Stage2Item[] {
  const out: Stage2Item[] = [];
  for (const it of items) {
    const counts = q.contagens[it.criterio];
    const label = CRITERION_LABEL[it.criterio] ?? String(it.criterio);
    if (!counts) {
      descartes.push(`Item sobre "${label}" descartado: critério indisponível nesta leva.`);
      continue;
    }
    if (it.faixa !== section) {
      descartes.push(`Item sobre "${label}" descartado: faixa "${it.faixa}" na seção errada.`);
      continue;
    }
    const nCasos = section === "alto" ? counts.alto_8_10 : counts.baixo_0_4;
    if (nCasos === 0) {
      descartes.push(`Item sobre "${label}" descartado: nenhuma conversa na faixa "${section}".`);
      continue;
    }
    if (INVENTED_COUNT.test(it.texto.replace(/\{n_casos\}|\{n_total\}/g, ""))) {
      descartes.push(`Item sobre "${label}" descartado: texto com quantidade não sustentada pelos dados.`);
      continue;
    }

    const texto = anonymizeText(
      it.texto.replaceAll("{n_casos}", String(nCasos)).replaceAll("{n_total}", String(counts.aplicavel))
    );
    const script = it.script_sugerido ? anonymizeText(it.script_sugerido) : null;
    out.push({
      criterio: it.criterio,
      faixa: it.faixa,
      n_casos: nCasos,
      n_total: counts.aplicavel,
      texto,
      script_sugerido: script || null,
    });
  }
  return out;
}

/** Valida a saída da IA contra as contagens reais e preenche os números. */
export function finalizeStage2(raw: RawStage2Output, q: Qualidade): FinalizeResult {
  const descartes: string[] = [];
  return {
    fortes: finalizeItems(raw.pontos_fortes, "alto", q, descartes),
    oportunidades: finalizeItems(raw.oportunidades, "baixo", q, descartes),
    descartes,
  };
}

export const STAGE2_SYSTEM_PROMPT = `Você escreve feedback gerencial de atendimento via WhatsApp a partir de agregados já calculados.
Regras:
1. Não recalcule notas nem médias. Use os números fornecidos.
2. Cada item se apoia em uma contagem de "contagens": informe "criterio" e "faixa" ("alto" para pontos fortes, "baixo" para oportunidades). O sistema preenche o número real.
3. No "texto", escreva {n_casos} e {n_total} onde entram as quantidades (ex.: "Em {n_casos} das {n_total} conversas..."). Não escreva nenhuma outra quantidade de conversas.
4. Traga um exemplo concreto tirado de "casos" (parafraseado, sem dados pessoais) e, nas oportunidades, uma frase pronta de script em "script_sugerido".
5. Não use nome, telefone ou documento de cliente. O nome do atendente pode aparecer.
6. De 2 a 4 pontos fortes e de 2 a 4 oportunidades. Sem base para um item, devolva menos itens.
7. Critérios em "criterios_indisponiveis" não podem ser citados.`;

export const STAGE2_MES_SYSTEM_PROMPT = `${STAGE2_SYSTEM_PROMPT}
8. Este é o relatório do MÊS inteiro. "semanas_publicadas" traz o que já foi escrito para cada semana do mês. Use isso só como contexto: aponte o que se repetiu ao longo do mês (ex.: "Isso apareceu em várias semanas") e o que aconteceu uma vez só.
9. Não copie frases das semanas, não cite datas nem números de semanas, e não escreva nenhuma quantidade (nem "3 semanas"): diga "várias semanas", "quase todas as semanas", "no começo do mês".
10. Os números e os casos do mês valem mais do que o texto das semanas: se divergirem, siga os números do mês.`;

const itemSchema = {
  type: "object",
  properties: {
    criterio: { type: "string", enum: [...CRITERIA] },
    faixa: { type: "string", enum: ["alto", "baixo"] },
    texto: { type: "string" },
    script_sugerido: { type: ["string", "null"] },
  },
  required: ["criterio", "faixa", "texto", "script_sugerido"],
  additionalProperties: false,
};

export const stage2JsonSchema = {
  name: "stage2_managerial_synthesis",
  strict: true,
  schema: {
    type: "object",
    properties: {
      pontos_fortes: { type: "array", items: itemSchema },
      oportunidades: { type: "array", items: itemSchema },
    },
    required: ["pontos_fortes", "oportunidades"],
    additionalProperties: false,
  },
};
