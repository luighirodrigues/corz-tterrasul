import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { textoDoComando } from "./comandos";

/**
 * Os comandos disparados por HTTP rodam no próprio CLI, num processo filho: `node <tsx> src/cli.ts <comando> <flags>`,
 * o mesmo que o `pnpm <comando> -- <flags>` do terminal (mesma trava, mesmos logs, mesmo código de saída). A lista das
 * execuções fica na memória do servidor e some quando ele reinicia; a saída vai também para o log do serviço.
 */

export type StatusExecucao = "rodando" | "concluido" | "erro";

export interface Execucao {
  id: string;
  comando: string;
  inicio: Date;
  fim: Date | null;
  status: StatusExecucao;
  codigo: number | null;
  saida: string[];
}

export const LINHAS_GUARDADAS = 300;
export const EXECUCOES_GUARDADAS = 20;

interface Registro {
  execucoes: Map<string, Execucao>;
  terminos: Map<string, Promise<void>>;
}

declare global {
  // eslint-disable-next-line no-var
  var execucoesHttp: Registro | undefined;
}

// No globalThis: o `next dev` recarrega os módulos e a lista se perderia a cada mudança.
function registro(): Registro {
  return (globalThis.execucoesHttp ??= { execucoes: new Map(), terminos: new Map() });
}

/** O CLI pelo `tsx`, sem shell: funciona igual no Windows do desenvolvimento e no Linux do container. */
function argsDoCli(): string[] {
  return [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), path.join("src", "cli.ts")];
}

function novoId(execucoes: Map<string, Execucao>): string {
  let id: string;
  do id = randomBytes(3).toString("hex");
  while (execucoes.has(id));
  return id;
}

/** Guarda só as últimas, sem tirar uma que ainda roda. */
function podar(execucoes: Map<string, Execucao>, terminos: Map<string, Promise<void>>) {
  for (const [id, e] of execucoes) {
    if (execucoes.size <= EXECUCOES_GUARDADAS) break;
    if (e.status === "rodando") continue;
    execucoes.delete(id);
    terminos.delete(id);
  }
}

/**
 * Inicia o comando e devolve na hora, sem esperar ele terminar. O processo não fica preso à requisição: se quem
 * chamou desistir, o comando continua. `script` troca o CLI por outro arquivo (testes).
 */
export function iniciarExecucao(argv: string[], opcoes: { script?: string } = {}): Execucao {
  const { execucoes, terminos } = registro();
  const exec: Execucao = {
    id: novoId(execucoes),
    comando: textoDoComando(argv),
    inicio: new Date(),
    fim: null,
    status: "rodando",
    codigo: null,
    saida: [],
  };
  const prefixo = `[disparo ${argv[0]} ${exec.id}]`;

  const guardar = (linha: string, erro = false) => {
    exec.saida.push(linha);
    if (exec.saida.length > LINHAS_GUARDADAS) exec.saida.splice(0, exec.saida.length - LINHAS_GUARDADAS);
    (erro ? console.error : console.log)(`${prefixo} ${linha}`);
  };

  let resolver!: () => void;
  terminos.set(exec.id, new Promise<void>((r) => (resolver = r)));
  execucoes.set(exec.id, exec);
  podar(execucoes, terminos);

  const finalizar = (codigo: number | null) => {
    if (exec.status !== "rodando") return;
    exec.codigo = codigo;
    exec.status = codigo === 0 ? "concluido" : "erro";
    exec.fim = new Date();
    console.log(`${prefixo} Terminou: ${exec.status} (código ${codigo ?? "nenhum"}).`);
    resolver();
  };

  console.log(`${prefixo} Iniciando: ${exec.comando}`);
  const args = opcoes.script ? [opcoes.script] : argsDoCli();
  const filho = spawn(process.execPath, [...args, ...argv], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  // A saída chega em pedaços: só guarda linhas inteiras, e o resto no fim.
  const leitor = (erro: boolean) => {
    let resto = "";
    return {
      dados: (pedaco: Buffer) => {
        const linhas = (resto + pedaco.toString("utf8")).split(/\r?\n/);
        resto = linhas.pop() ?? "";
        for (const l of linhas) guardar(l, erro);
      },
      fim: () => {
        if (resto) guardar(resto, erro);
        resto = "";
      },
    };
  };
  const out = leitor(false);
  const err = leitor(true);
  filho.stdout.on("data", out.dados);
  filho.stderr.on("data", err.dados);

  filho.on("error", (e) => {
    guardar(`Não foi possível iniciar o comando: ${e.message}`, true);
    finalizar(null);
  });
  filho.on("close", (codigo, sinal) => {
    out.fim();
    err.fim();
    if (sinal) guardar(`Interrompido (${sinal}).`, true);
    finalizar(codigo ?? 1);
  });

  return exec;
}

/** Espera o comando terminar, no máximo `ms`. */
export async function aguardar(exec: Execucao, ms: number): Promise<void> {
  const termino = registro().terminos.get(exec.id);
  if (!termino || exec.status !== "rodando") return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([termino, new Promise<void>((r) => (timer = setTimeout(r, ms)))]);
  clearTimeout(timer);
}

export function buscarExecucao(id: string): Execucao | undefined {
  return registro().execucoes.get(id);
}

export function algumaRodando(): boolean {
  return [...registro().execucoes.values()].some((e) => e.status === "rodando");
}

export function execucaoParaJson(exec: Execucao) {
  return {
    id: exec.id,
    comando: exec.comando,
    status: exec.status,
    codigo: exec.codigo,
    inicio: exec.inicio.toISOString(),
    fim: exec.fim?.toISOString() ?? null,
    saida: exec.saida,
  };
}
