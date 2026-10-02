export const META_NOTA = 8;
export type Tone = "good" | "warn" | "bad" | "neutral";

export function scoreStatus(n: number | null | undefined): { label: string; tone: Tone } {
  if (n == null) return { label: "Sem avaliação", tone: "neutral" };
  if (n >= 8) return { label: "Na meta", tone: "good" };
  if (n >= 6) return { label: "Atenção", tone: "warn" };
  return { label: "Abaixo da meta", tone: "bad" };
}

export const TONE_CHIP: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-subtle text-muted",
};

export const TONE_FILL: Record<Tone, string> = {
  good: "var(--color-good-fill)",
  warn: "var(--color-warn-fill)",
  bad: "var(--color-bad-fill)",
  neutral: "var(--color-line)",
};

export const TONE_DOT: Record<Tone, string> = {
  good: "bg-good-fill",
  warn: "bg-warn-fill",
  bad: "bg-bad-fill",
  neutral: "bg-line",
};

export const CRITERIOS = [
  { key: "atrito", label: "Pouco atrito", description: "Conversa fluida, sem desgaste com o cliente" },
  { key: "solucao", label: "Apresentou solução clara", description: "Deu uma resposta real para o pedido" },
  { key: "necessidade", label: "Entendeu a necessidade", description: "Ouviu e identificou o que o cliente buscava" },
  { key: "proximoPasso", label: "Combinou o próximo passo", description: "Deixou claro o que acontece depois" },
  { key: "resolvida", label: "Conversa resolvida", description: "Terminou com agendamento ou retorno firmado" },
] as const;

const ORIGENS_AUTOMATICAS: Record<string, string> = {
  BOT: "Robô",
  OFFICE_HOURS: "Fora do horário",
  CAMPAIGN: "Campanha",
  PAYMENT: "Pagamento",
  API: "Integração",
};

export const origemAutomatica = (origin: string): string => ORIGENS_AUTOMATICAS[origin] ?? "Sistema";

/** Tira prefixos técnicos dos nomes de escopo. */
export const nomeEscopo = (title: string): string =>
  title
    .replace(/^Divisão\s+/, "")
    .replace(/^Equipe\s+/, "")
    .replace(/^Painel CRM\s*-?\s*/, "")
    .replace(/^Atendente\s*-\s*/, "");

export const MSG = {
  erroDados: "Não foi possível carregar os dados agora. Tente novamente em alguns minutos.",
  carregando: "Carregando…",
  amostraPequena: "Amostra pequena: menos de 10 conversas avaliadas. Leia os números como uma indicação inicial.",
};

export type TipoPeriodo = "semana" | "mes" | "livre";

/** Textos que mudam com o tipo de período (semana, mês ou intervalo escolhido). */
export const PERIODO: Record<
  TipoPeriodo,
  {
    /** "semana", "mês", "período" */
    nome: string;
    /** Rótulo da lista de períodos no cabeçalho. */
    maisRecente: string;
    nota: string;
    na: string;
    nesta: string;
    avaliadasNo: string;
    evolucao: string;
    analise: string;
    semRelatorio: string;
    semAnalise: string;
    nenhumaConversa: string;
  }
> = {
  semana: {
    nome: "semana",
    maisRecente: "Semana mais recente",
    nota: "Nota da semana",
    na: "na semana",
    nesta: "nesta semana",
    avaliadasNo: "avaliadas na semana",
    evolucao: "Evolução semanal",
    analise: "Análise da semana",
    semRelatorio: "Ainda não há resultados publicados para esta semana.",
    semAnalise: "A análise desta semana ainda não está disponível.",
    nenhumaConversa: "Nenhuma conversa avaliada nesta semana.",
  },
  mes: {
    nome: "mês",
    maisRecente: "Mês mais recente",
    nota: "Nota do mês",
    na: "no mês",
    nesta: "neste mês",
    avaliadasNo: "avaliadas no mês",
    evolucao: "Evolução mensal",
    analise: "Análise do mês",
    semRelatorio: "Ainda não há resultados publicados para nenhum mês.",
    semAnalise: "A análise deste mês ainda não está disponível.",
    nenhumaConversa: "Nenhuma conversa avaliada neste mês.",
  },
  livre: {
    nome: "período",
    maisRecente: "",
    nota: "Nota do período",
    na: "no período",
    nesta: "neste período",
    avaliadasNo: "avaliadas no período",
    evolucao: "Evolução semanal",
    analise: "Análise do período",
    semRelatorio: "Não há dados para este período.",
    semAnalise: "",
    nenhumaConversa: "Nenhuma conversa avaliada neste período.",
  },
};

/** "em relação à semana anterior" / "em relação a agosto" (mês). */
export const emRelacaoA = (tipo: TipoPeriodo, mesAnterior?: string) =>
  tipo === "mes" ? `em relação a ${mesAnterior ?? "o mês anterior"}` : "em relação à semana anterior";

export const conversasAvaliadas = (n: number) =>
  n === 0 ? "Nenhuma conversa avaliada" : n === 1 ? "1 conversa avaliada" : `${n} conversas avaliadas`;
