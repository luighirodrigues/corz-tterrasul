import { createHash, timingSafeEqual } from "node:crypto";

/**
 * O token do disparo por HTTP (`JOBS_TOKEN`), sem o Next: fica aqui para ser testado. Fora do `rules.ts` porque aquele
 * vai para o navegador, e este usa o `node:crypto`.
 */
export const JOBS_TOKEN_MINIMO = 32;

/** Compara os SHA-256, em tempo constante: o tempo da resposta não diz quantos caracteres bateram. */
export function tokenConfere(recebido: string | null | undefined, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const h = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(h(recebido), h(esperado));
}

/** O token do cabeçalho `Authorization: Bearer <token>`, ou null. */
export function tokenDoCabecalho(authorization: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "");
  return m ? m[1] : null;
}
