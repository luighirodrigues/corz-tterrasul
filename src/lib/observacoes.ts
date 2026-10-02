import { CRITERIA, CRITERION_LABEL, type Criterion } from "../domain/aggregate";
import { CRITERIOS } from "./labels";

/**
 * Tradução, na tela, das frases que o servidor grava em `limitacoes` (compute-scope, job-e, stage2, live-loader).
 * O banco e os jobs não mudam: relatórios já publicados também saem em português simples.
 * Frase nova criada no servidor aparece como veio até ganhar uma regra aqui.
 */
export interface Observacao {
  texto: string;
  /** Muda o que o número significa: aparece logo abaixo do resumo, e não na lista recolhida. */
  destaque: boolean;
}

const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`;
const conversas = (n: number) => plural(n, "conversa", "conversas");

/** Nome do critério como aparece na tela, a partir do nome que o servidor gravou. */
const NOME_NA_TELA = new Map<string, string>(
  CRITERIA.map((c: Criterion) => [CRITERION_LABEL[c], CRITERIOS.find((x) => x.key === c)!.label]),
);

const normal = (texto: string): Observacao => ({ texto, destaque: false });
const destacada = (texto: string): Observacao => ({ texto, destaque: true });

/** Uma linha gravada vira zero ou mais linhas na tela (a das conversas fora da nota vira até três). */
export function observacoes(linha: string): Observacao[] {
  let m: RegExpMatchArray | null;

  if (/^Amostra preliminar:/.test(linha)) return []; // o aviso de amostra pequena já aparece
  if (/^TMR de \d+ conversas veio do campo da sessão/.test(linha)) return [];
  if (/^Síntese de IA indisponível:/.test(linha)) return []; // o bloco da análise já avisa
  if (/^Item sobre ".*" descartado:/.test(linha)) return [];

  if ((m = linha.match(/^Conversas fora da nota: (.+)\.$/))) {
    const out: Observacao[] = [];
    const puladas = m[1].match(/(\d+) puladas/);
    const erro = m[1].match(/(\d+) com erro de análise/);
    const pendentes = m[1].match(/(\d+) ainda sem análise/);
    if (puladas) {
      const n = Number(puladas[1]);
      out.push(normal(`${conversas(n)} ${n === 1 ? "ficou" : "ficaram"} sem nota porque nenhuma pessoa respondeu.`));
    }
    if (erro) {
      const n = Number(erro[1]);
      out.push(normal(`${conversas(n)} ${n === 1 ? "não pôde" : "não puderam"} ser ${n === 1 ? "avaliada" : "avaliadas"}.`));
    }
    if (pendentes) {
      const n = Number(pendentes[1]);
      out.push(normal(`${conversas(n)} ainda ${n === 1 ? "vai" : "vão"} ser ${n === 1 ? "avaliada" : "avaliadas"}.`));
    }
    return out;
  }

  if ((m = linha.match(/^(\d+) de (\d+) conversas sem card \(sem esteira\)\.$/))) {
    return [normal(`${m[1]} de ${m[2]} conversas não estão ligadas a um negócio no CRM.`)];
  }

  if ((m = linha.match(/^Critério "(.+)" fora da nota: aplicável em (.+) das conversas\.$/))) {
    const nome = NOME_NA_TELA.get(m[1]) ?? m[1];
    return [normal(`O critério “${nome}” ficou fora da nota: só vale para ${m[2]} das conversas.`)];
  }

  if (/^\d+ conversas não entram em nenhuma equipe:/.test(linha)) return [normal(linha)];

  if ((m = linha.match(/^(\d+) sessões com mais de um card; usado o mais recente\.$/))) {
    const n = Number(m[1]);
    return [normal(`${conversas(n)} ${n === 1 ? "tem" : "têm"} mais de um negócio no CRM; contamos o mais recente.`)];
  }

  if (/^Funil usa o status atual dos cards/.test(linha)) {
    return [normal("Os negócios do CRM aparecem com a situação de hoje, não a do fim do período.")];
  }

  if ((m = linha.match(/^Sem comparação com (o mês|a semana) anterior: só .+ das conversas (?:dele|dela) têm análise na versão atual\.$/))) {
    return [normal(`Sem comparação com ${m[1]} anterior: ${m[1] === "o mês" ? "ele foi avaliado" : "ela foi avaliada"} antes da mudança nos critérios.`)];
  }
  if (/^Sem comparação com o mês anterior: ele é parcial/.test(linha)) return [normal(linha)];

  if (/^(Dados a partir de|O período começa antes dos dados)/.test(linha)) return [destacada(linha)];
  if (/^\d+ conversas com indicadores em atualização;/.test(linha)) return [normal(linha)];

  return [normal(linha)]; // frase desconhecida aparece como veio
}

/** Todas as linhas de `limitacoes`, já traduzidas e separadas entre avisos em destaque e observações. */
export function traduzirLimitacoes(limitacoes: string | null | undefined): { avisos: string[]; observacoes: string[] } {
  const todas = (limitacoes ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap(observacoes);
  return {
    avisos: todas.filter((o) => o.destaque).map((o) => o.texto),
    observacoes: todas.filter((o) => !o.destaque).map((o) => o.texto),
  };
}
