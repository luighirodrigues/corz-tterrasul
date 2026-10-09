import { authorizeJobToken } from "@/auth/job-token";
import { json } from "@/jobs/http/disparo";
import { buscarExecucao, execucaoParaJson } from "@/jobs/http/execucoes";

/** Acompanha um comando disparado por `/api/jobs/<nome>`: se ainda roda, o código de saída e as últimas linhas. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = authorizeJobToken(request);
  if (negado) return negado;
  const exec = buscarExecucao((await params).id);
  if (!exec) return json({ error: "Execução não encontrada (o servidor pode ter reiniciado)." }, 404);
  return json(execucaoParaJson(exec), 200);
}
