/**
 * Os comandos que outro serviço dispara por HTTP e as flags de cada um: exatamente as que o `src/cli.ts` lê para
 * aquele comando. Na URL, a flag vai sem os traços: `/api/jobs/daily?email` = `pnpm daily -- --email`.
 * A diferença em relação ao terminal: aqui uma opção desconhecida ou um valor errado é recusado antes de rodar.
 * Alcançado pela tela: importa sem `.js`.
 */

/** `liga`: sem valor. `dia`: AAAA-MM-DD. `mes`: AAAA-MM. `texto`: um valor livre. */
type TipoFlag = "liga" | "dia" | "mes" | "texto";

export const COMANDOS_HTTP = {
  daily: { cli: "daily", flags: { email: "liga" } },
  // O publish:weekly divide o código com o job:report, por isso lê também o --month.
  weekly: {
    cli: "publish:weekly",
    flags: {
      week: "dia",
      month: "mes",
      "dry-run": "liga",
      "allow-incomplete": "liga",
      correct: "liga",
      reason: "texto",
      email: "liga",
    },
  },
  // Sempre o último mês encerrado: não lê --week nem --month.
  monthly: {
    cli: "publish:monthly",
    flags: { "dry-run": "liga", "allow-incomplete": "liga", correct: "liga", reason: "texto", email: "liga" },
  },
} as const satisfies Record<string, { cli: string; flags: Record<string, TipoFlag> }>;

export type ComandoHttp = keyof typeof COMANDOS_HTTP;

export const MOTIVO_MAXIMO = 500;

const LIGA = new Set(["", "1", "true"]);
const DESLIGA = new Set(["0", "false"]);

export function flagsAceitas(nome: ComandoHttp): string[] {
  return Object.keys(COMANDOS_HTTP[nome].flags);
}

function diaValido(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/**
 * A query da URL vira o `argv` do CLI: `?email&week=2026-09-17` → `["publish:weekly", "--week", "2026-09-17", "--email"]`,
 * na ordem do mapa. Devolve o motivo quando algo não confere, sem rodar nada.
 */
export function montarArgv(nome: ComandoHttp, params: URLSearchParams): { argv: string[] } | { erro: string } {
  const flags: Record<string, TipoFlag> = COMANDOS_HTTP[nome].flags;
  const aceitas = flagsAceitas(nome).join(", ");
  const chaves = [...new Set(params.keys())];

  const desconhecidas = chaves.filter((k) => !(k in flags));
  if (desconhecidas.length) {
    return { erro: `Opção desconhecida: ${desconhecidas.join(", ")}. Em /api/jobs/${nome}, as aceitas são: ${aceitas}.` };
  }

  const valores: Record<string, string> = {};
  for (const k of chaves) {
    const todos = params.getAll(k);
    if (todos.length > 1) return { erro: `A opção ${k} veio mais de uma vez.` };
    const v = todos[0].trim();
    switch (flags[k]) {
      case "liga":
        if (!LIGA.has(v.toLowerCase()) && !DESLIGA.has(v.toLowerCase())) {
          return { erro: `${k} não leva valor (ou aceita 1, true, 0 e false); veio "${v}".` };
        }
        break;
      case "dia":
        if (!diaValido(v)) return { erro: `${k} precisa ser uma data AAAA-MM-DD; veio "${v}".` };
        break;
      case "mes":
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return { erro: `${k} precisa ser um mês AAAA-MM; veio "${v}".` };
        break;
      case "texto":
        if (!v) return { erro: `${k} precisa de um valor.` };
        if (v.length > MOTIVO_MAXIMO) return { erro: `${k} passa de ${MOTIVO_MAXIMO} caracteres.` };
        break;
    }
    valores[k] = v;
  }

  const ligada = (k: string) => k in valores && LIGA.has(valores[k].toLowerCase());
  if ("week" in valores && "month" in valores) return { erro: "Use week ou month, não os dois." };
  if (ligada("correct") && !("reason" in valores)) return { erro: "correct exige reason, com o motivo da correção." };

  const argv: string[] = [COMANDOS_HTTP[nome].cli];
  for (const [k, tipo] of Object.entries(flags)) {
    if (!(k in valores)) continue;
    if (tipo === "liga") {
      if (ligada(k)) argv.push(`--${k}`);
    } else {
      argv.push(`--${k}`, valores[k]);
    }
  }
  return { argv };
}

/** `["daily", "--email"]` → `pnpm daily -- --email`, para a resposta e o log. */
export function textoDoComando(argv: string[]): string {
  const [comando, ...resto] = argv;
  const arg = (a: string) => (/^[\w:.\/-]+$/.test(a) ? a : JSON.stringify(a));
  return resto.length ? `pnpm ${comando} -- ${resto.map(arg).join(" ")}` : `pnpm ${comando}`;
}
