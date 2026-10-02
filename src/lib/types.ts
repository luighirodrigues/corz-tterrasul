export type ScopeType = "geral" | "divisao" | "equipe" | "painel" | "agente";

/** semana e mês são relatórios publicados; livre é calculado na hora, para um intervalo qualquer. */
export type Granularidade = "semana" | "mes" | "livre";
/** Tipos de período que têm relatório publicado (lista de períodos, histórico). */
export type TipoPublicado = Exclude<Granularidade, "livre">;

export interface CriteriaScores {
  atrito: number | null;
  solucao: number | null;
  necessidade: number | null;
  proximoPasso: number | null;
  resolvida: number | null;
}

export interface KpiMetrics {
  n: number;
  tmrMedioFormatado: string;
  tmrMedioSegundos?: number | null;
  ftrMedianaFormatada: string;
  ftrMedianaSegundos?: number | null;
  respClientePct: number | null;
  semRespostaPct: number | null;
  taxaFechamentoPct: number | null;
  reativacaoPct: number | null;
}

export interface AiInsight {
  n_casos: number;
  texto: string;
  script_sugerido?: string | null;
}

export interface FunnelStage {
  name: string;
  count: number;
}

export interface FunnelData {
  etapas: Record<string, number>;
  open: number;
  won: number;
  lost: number;
  lostReasons: Record<string, number>;
  desconsideradas?: { foraDoControle: number; higienizacao: number };
}

export interface Comparativo {
  periodoAnterior: { start: string; end: string };
  notaAnteriorRecalculada: number;
  deltaNota: number;
  mediasAnteriores: Record<string, number | null>;
  deltaMedias: Record<string, number | null>;
  nAnterior: number;
}

export interface Destaque {
  sessionExternalId: string;
  nota: number;
  resumo: string;
  agentName: string | null;
}

export interface Destaques {
  melhores: Destaque[];
  piores: Destaque[];
}

export interface ReportItem {
  id: string;
  granularity: Granularidade;
  title: string;
  slug: string;
  scopeType: ScopeType;
  scopeId: string;
  /** Só atendentes: equipe principal na semana (grupo com mais conversas dele). */
  equipe?: string | null;
  periodStart: string;
  periodEnd: string;
  preliminar: boolean;
  limitacoes?: string | null;
  notaGeral: number | null;
  totalConversas: number;
  medias: CriteriaScores;
  histograma: number[];
  sinteticos: KpiMetrics;
  funil?: FunnelData | null;
  textoFortes: AiInsight[] | null;
  textoOps: AiInsight[] | null;
  model?: string | null;
  promptVersionSintese?: string | null;
  comparativo?: Comparativo | null;
  correctedAt?: string | null;
  correctionReason?: string | null;
  /** Só período livre: calculado agora, sem texto da IA. */
  calculadoAgora?: boolean;
  /** Só período livre: quando o último sync terminou (ISO). */
  dadosAte?: string | null;
  /** Só período livre: conversas encerradas no período que ainda não foram avaliadas. */
  semAvaliacao?: number;
  /** Só período livre: as 3 melhores e as 3 piores conversas. */
  destaques?: Destaques;
}

export interface MessageItem {
  id: string;
  timestamp: string;
  direction: "TO_HUB" | "FROM_HUB";
  origin: "BOT" | "DEFAULT" | "API" | string;
  sender: "cliente" | "operacao";
  text: string;
}

export interface SessionDetail {
  id: string;
  number?: string | null;
  agentName: string;
  equipe?: string | null;
  contactName: string;
  contactPhone: string;
  panelName?: string;
  startAt: string | null;
  endAt: string | null;
  durationMinutes: number | null;
  status: string;
  notaConversa: number | null;
  scores: CriteriaScores;
  resumo1Linha: string | null;
  evidencias?: Record<string, string>;
  messages: MessageItem[];
}
