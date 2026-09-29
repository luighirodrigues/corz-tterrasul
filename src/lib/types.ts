export type ScopeType = "geral" | "divisao" | "painel" | "agente";

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
  ftrMedianaFormatada: string;
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

export interface ReportItem {
  id: string;
  title: string;
  slug: string;
  scopeType: ScopeType;
  scopeId: string;
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
