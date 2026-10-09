import { authorizeJobToken } from "@/auth/job-token";
import { dispararComando, metodoNaoPermitido } from "@/jobs/http/disparo";

/**
 * Outro serviço dispara o comando, com o token no cabeçalho. `GET /api/jobs/daily?email` faz o mesmo que `pnpm daily -- --email`.
 * As flags aceitas estão em `src/jobs/http/comandos.ts`; o guia, em `docs/COMANDOS.md`, §8.
 */
export async function GET(request: Request) {
  const negado = authorizeJobToken(request);
  if (negado) return negado;
  return dispararComando("daily", request);
}

export const HEAD = metodoNaoPermitido;
