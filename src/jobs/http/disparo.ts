import "server-only";
import { NextResponse } from "next/server";
import { TRAVA_JOBS, travaOcupada } from "@/domain/lock";
import { flagsAceitas, montarArgv, type ComandoHttp } from "./comandos";
import { aguardar, algumaRodando, execucaoParaJson, iniciarExecucao } from "./execucoes";

/** Quanto a rota espera antes de responder: pega o comando que falha logo ao começar (trava ocupada, por exemplo). */
const ESPERA_MS = 2000;
const OCUPADO = "Outro comando já está em andamento. Aguarde ele terminar.";

export function json(body: unknown, status: number, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * O `GET /api/jobs/<nome>` depois do token: confere as flags, a trava e inicia o comando. Responde 202 com o id para
 * acompanhar em `/api/jobs/execucoes/<id>`, sem esperar o fim (o `daily` com IA leva minutos).
 */
export async function dispararComando(nome: ComandoHttp, request: Request): Promise<NextResponse> {
  const montado = montarArgv(nome, new URL(request.url).searchParams);
  if ("erro" in montado) return json({ error: montado.erro, aceitas: flagsAceitas(nome) }, 400);

  // A trava no banco cobre também o que foi iniciado no terminal.
  try {
    if (algumaRodando() || (await travaOcupada(TRAVA_JOBS))) return json({ error: OCUPADO }, 409);
  } catch {
    return json({ error: "Banco indisponível." }, 503);
  }

  const exec = iniciarExecucao(montado.argv);
  await aguardar(exec, ESPERA_MS);

  if (exec.status === "erro") {
    // Entre a conferência acima e o CLI pegar a trava, outro comando pode ter começado.
    const trava = exec.saida.some((l) => l.includes("já está em andamento"));
    return json({ error: trava ? OCUPADO : "O comando falhou logo ao começar.", ...execucaoParaJson(exec) }, trava ? 409 : 500);
  }
  return json(
    {
      id: exec.id,
      comando: exec.comando,
      status: exec.status,
      inicio: exec.inicio.toISOString(),
      acompanhar: `/api/jobs/execucoes/${exec.id}`,
    },
    202
  );
}

/** Sem isto o Next responde o HEAD chamando o GET, e um monitor de disponibilidade dispararia o comando. */
export function metodoNaoPermitido(): NextResponse {
  return json({ error: "Use GET." }, 405, { Allow: "GET" });
}
