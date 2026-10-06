import { nomeEscopo } from "../lib/labels";
import { resolveScopeTitle, type TitleTenant } from "./scope-title";
import type { TeamGroup } from "./teams";

/**
 * Escopos que dá para acompanhar por e-mail: os mesmos do menu de visão do painel (`ScopeMenu`), menos o do
 * atendente. Alcançado pela tela e pelos jobs, então importa sem `.js` (o `web-imports.test.ts` vigia).
 */
export type TipoAssinavel = "geral" | "divisao" | "equipe" | "painel";

export interface EscopoAssinavel {
  scopeType: TipoAssinavel;
  scopeId: string;
  /** O nome como o menu de visão mostra: "Peças", "Veículos (Vendas & Campanhas)". */
  nome: string;
  /** O nome com o tipo na frente, para frases soltas: "Equipe Peças", "Geral". */
  rotulo: string;
}

export interface GrupoAssinavel {
  tipo: TipoAssinavel;
  titulo: string;
  escopos: EscopoAssinavel[];
}

export const GRUPOS_ASSINAVEIS: Array<{ tipo: TipoAssinavel; titulo: string }> = [
  { tipo: "geral", titulo: "Geral" },
  { tipo: "divisao", titulo: "Divisões" },
  { tipo: "equipe", titulo: "Equipes" },
  { tipo: "painel", titulo: "Painéis do CRM" },
];

const DIVISOES = ["carros", "pecas"];

/**
 * Um escopo sem nota, sem conversas e sem negócios no CRM não tem o que mostrar: sai do menu de visão e do e-mail.
 * O Geral fica sempre.
 */
export function temConteudo(r: {
  scopeType: string;
  notaGeral: number | null;
  sinteticos: { n: number };
  funil?: { open: number; won: number; lost: number } | null;
}): boolean {
  if (r.scopeType === "geral" || r.notaGeral != null || r.sinteticos.n > 0) return true;
  const f = r.funil;
  return !!f && f.open + f.won + f.lost > 0;
}

const PREFIXO: Record<TipoAssinavel, string> = { geral: "", divisao: "Divisão ", equipe: "Equipe ", painel: "Painel " };

/** "Geral", "Divisão Veículos (…)", "Equipe Peças", "Painel Vendas": o escopo por extenso, exista ele ainda ou não. */
export function rotuloEscopo(scopeType: string, scopeId: string, tenant: TitleTenant | null = null): string {
  if (scopeType === "geral") return "Geral";
  const nome = nomeEscopo(resolveScopeTitle({ scopeType, scopeId }, tenant).title) || scopeId;
  const prefixo = PREFIXO[scopeType as TipoAssinavel];
  return prefixo ? `${prefixo}${nome}` : nome;
}

export const chaveEscopo = (e: { scopeType: string; scopeId: string }) => `${e.scopeType}:${e.scopeId}`;

/** Os escopos na ordem do menu: Geral, as duas divisões, as equipes do `.env` e os painéis que têm id no tenant. */
export function listSubscribableScopes(tenant: TitleTenant | null, teamGroups: TeamGroup[]): EscopoAssinavel[] {
  const refs: Array<{ scopeType: TipoAssinavel; scopeId: string }> = [
    { scopeType: "geral", scopeId: "geral" },
    ...DIVISOES.map((scopeId) => ({ scopeType: "divisao" as const, scopeId })),
    ...teamGroups.map((g) => ({ scopeType: "equipe" as const, scopeId: g.name })),
    ...[tenant?.panelVendasId, tenant?.panelCampanhasId, tenant?.panelPecasId, tenant?.panelOficinaId]
      .filter((id): id is string => !!id)
      .map((scopeId) => ({ scopeType: "painel" as const, scopeId })),
  ];
  return refs.map((r) => ({
    ...r,
    nome: r.scopeType === "geral" ? "Visão geral da operação" : nomeEscopo(resolveScopeTitle(r, tenant).title) || r.scopeId,
    rotulo: rotuloEscopo(r.scopeType, r.scopeId, tenant),
  }));
}

/** A mesma lista, repartida nos grupos do menu (grupo sem escopo some). */
export function agruparEscopos(escopos: EscopoAssinavel[]): GrupoAssinavel[] {
  return GRUPOS_ASSINAVEIS.map((g) => ({ ...g, escopos: escopos.filter((e) => e.scopeType === g.tipo) })).filter((g) => g.escopos.length > 0);
}
