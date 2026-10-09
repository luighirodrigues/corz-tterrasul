import "server-only";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { JOBS_TOKEN_MINIMO, tokenConfere, tokenDoCabecalho } from "./job-token-rules";

/**
 * Para as rotas de `/api/jobs/`, que outros serviços chamam sem login: devolve null quando o token do cabeçalho
 * confere com o `JOBS_TOKEN`, ou a resposta pronta (503 com o disparo desligado, 401 sem token ou com token errado).
 *
 *     const negado = authorizeJobToken(request);
 *     if (negado) return negado;
 */
export function authorizeJobToken(request: Request): NextResponse | null {
  const esperado = env.JOBS_TOKEN.trim();
  if (!esperado) return resposta({ error: "Disparo por HTTP desligado: configure JOBS_TOKEN." }, 503);
  if (esperado.length < JOBS_TOKEN_MINIMO) {
    return resposta({ error: `JOBS_TOKEN curto demais: use pelo menos ${JOBS_TOKEN_MINIMO} caracteres.` }, 503);
  }
  if (!tokenConfere(tokenDoCabecalho(request.headers.get("authorization")), esperado)) {
    const r = resposta({ error: "Token ausente ou inválido." }, 401);
    r.headers.set("WWW-Authenticate", "Bearer");
    return r;
  }
  return null;
}

function resposta(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
