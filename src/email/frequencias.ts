import { temConteudo } from "../domain/report-scopes";

/**
 * Com que frequência cada pessoa recebe o resumo por e-mail. Regras puras, sem banco: a tela de usuários e o job
 * de envio usam as mesmas. Alcançado pela tela e pelo job, então importa sem `.js` (o `web-imports.test.ts` vigia).
 */
export type Frequencia = "dia" | "semana" | "mes";

export type CampoFrequencia = "resumoDia" | "resumoSemana" | "resumoMes";

/** Na ordem da tela. */
export const FREQUENCIAS: Array<{ granularity: Frequencia; rotulo: string; campo: CampoFrequencia }> = [
  { granularity: "dia", rotulo: "Diário", campo: "resumoDia" },
  { granularity: "semana", rotulo: "Semanal", campo: "resumoSemana" },
  { granularity: "mes", rotulo: "Mensal", campo: "resumoMes" },
];

export type FrequenciasDoUsuario = Record<CampoFrequencia, boolean>;

/** A caixa daquela frequência está marcada? */
export function recebe(usuario: FrequenciasDoUsuario, granularity: Frequencia): boolean {
  const f = FREQUENCIAS.find((x) => x.granularity === granularity);
  return !!f && usuario[f.campo];
}

const ADJETIVO: Record<Frequencia, string> = { dia: "diário", semana: "semanal", mes: "mensal" };

/** "diário, semanal e mensal" · "só o semanal" · "nenhuma frequência". */
export function textoFrequencias(usuario: FrequenciasDoUsuario): string {
  const marcadas = FREQUENCIAS.filter((f) => usuario[f.campo]).map((f) => ADJETIVO[f.granularity]);
  if (marcadas.length === 0) return "nenhuma frequência";
  if (marcadas.length === 1) return `só o ${marcadas[0]}`;
  return `${marcadas.slice(0, -1).join(", ")} e ${marcadas[marcadas.length - 1]}`;
}

/**
 * O escopo entra no e-mail? No dia, só com nota (um dia sem conversa avaliada fica fora, até o Geral). Na semana e
 * no mês vale o `temConteudo`, que mantém o Geral sempre.
 */
export function blocoEntra(
  relatorio: { scopeType: string; notaGeral: number | null; sinteticos: { n: number }; funil?: { open: number; won: number; lost: number } | null },
  granularity: Frequencia,
): boolean {
  if (granularity === "dia") return relatorio.notaGeral != null;
  return temConteudo(relatorio);
}
