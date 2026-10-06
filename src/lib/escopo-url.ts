/**
 * O escopo no endereço do painel: `?escopo=equipe:Peças`. Só os escopos do menu de visão entram; o Geral é o
 * padrão e fica de fora, e a ficha do atendente também (ver `PLANO_PRIMEIRO_USO.md`).
 */
export interface EscopoUrl {
  scopeType: "divisao" | "equipe" | "painel";
  scopeId: string;
}

const TIPOS = ["divisao", "equipe", "painel"];

/** `"equipe:Peças"` → `{ equipe, Peças }`; qualquer outra coisa (vazio, geral, agente, sem id) → null. */
export function lerEscopoUrl(raw: string | null | undefined): EscopoUrl | null {
  if (!raw) return null;
  const i = raw.indexOf(":");
  if (i < 0) return null;
  const scopeType = raw.slice(0, i);
  const scopeId = raw.slice(i + 1).trim();
  if (!TIPOS.includes(scopeType) || !scopeId) return null;
  return { scopeType: scopeType as EscopoUrl["scopeType"], scopeId };
}

/** O valor do parâmetro `escopo` para um relatório; null para o Geral e para o atendente. */
export function escopoParaUrl(r: { scopeType: string; scopeId: string }): string | null {
  return TIPOS.includes(r.scopeType) ? `${r.scopeType}:${r.scopeId}` : null;
}
