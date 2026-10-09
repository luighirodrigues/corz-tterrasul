import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMANDOS_HTTP, MOTIVO_MAXIMO, montarArgv, textoDoComando, type ComandoHttp } from "../src/jobs/http/comandos";
import { tokenConfere, tokenDoCabecalho } from "../src/auth/job-token-rules";

const argv = (nome: ComandoHttp, query: string) => montarArgv(nome, new URLSearchParams(query));

describe("flags do disparo por HTTP", () => {
  it("sem opções, só o comando", () => {
    expect(argv("daily", "")).toEqual({ argv: ["daily"] });
    expect(argv("weekly", "")).toEqual({ argv: ["publish:weekly"] });
    expect(argv("monthly", "")).toEqual({ argv: ["publish:monthly"] });
  });

  it("flag ligada: sem valor, 1 ou true; 0 e false deixam de fora", () => {
    for (const q of ["email", "email=", "email=1", "email=true", "email=TRUE"]) expect(argv("daily", q)).toEqual({ argv: ["daily", "--email"] });
    for (const q of ["email=0", "email=false"]) expect(argv("daily", q)).toEqual({ argv: ["daily"] });
    expect(argv("daily", "email=talvez")).toEqual({ erro: expect.stringContaining("não leva valor") });
  });

  it("opção desconhecida é recusada, com a lista das aceitas", () => {
    const r = argv("daily", "emial");
    expect(r).toEqual({ erro: expect.stringContaining("Opção desconhecida: emial") });
    expect("erro" in r && r.erro).toContain("as aceitas são: email");
    // O monthly usa sempre o último mês encerrado: não lê week nem month.
    expect(argv("monthly", "week=2026-09-17")).toEqual({ erro: expect.stringContaining("Opção desconhecida: week") });
    expect(argv("monthly", "month=2026-09")).toEqual({ erro: expect.stringContaining("Opção desconhecida: month") });
    expect(argv("daily", "dry-run")).toEqual({ erro: expect.stringContaining("Opção desconhecida: dry-run") });
  });

  it("confere a data e o mês", () => {
    expect(argv("weekly", "week=2026-09-17")).toEqual({ argv: ["publish:weekly", "--week", "2026-09-17"] });
    expect(argv("weekly", "month=2026-09")).toEqual({ argv: ["publish:weekly", "--month", "2026-09"] });
    for (const q of ["week=2026-13-40", "week=2026-02-30", "week=17/09/2026", "week="]) {
      expect(argv("weekly", q)).toEqual({ erro: expect.stringContaining("AAAA-MM-DD") });
    }
    for (const q of ["month=2026-9", "month=2026-13", "month=2026-09-01"]) {
      expect(argv("weekly", q)).toEqual({ erro: expect.stringContaining("AAAA-MM") });
    }
    expect(argv("weekly", "week=2026-09-17&month=2026-09")).toEqual({ erro: "Use week ou month, não os dois." });
  });

  it("correct exige reason, e o motivo chega inteiro como um item só", () => {
    expect(argv("monthly", "correct")).toEqual({ erro: expect.stringContaining("correct exige reason") });
    expect(argv("monthly", "correct&reason=")).toEqual({ erro: "reason precisa de um valor." });
    expect(argv("monthly", `correct&reason=${"x".repeat(MOTIVO_MAXIMO + 1)}`)).toEqual({ erro: expect.stringContaining("passa de") });
    const motivo = `Sync "atrasado" de 30/09; rm -rf $HOME`;
    expect(argv("monthly", `correct&reason=${encodeURIComponent(motivo)}`)).toEqual({
      argv: ["publish:monthly", "--correct", "--reason", motivo],
    });
  });

  it("monta na ordem do mapa, qualquer que seja a ordem da URL", () => {
    expect(argv("weekly", "email&dry-run&allow-incomplete&week=2026-09-17")).toEqual({
      argv: ["publish:weekly", "--week", "2026-09-17", "--dry-run", "--allow-incomplete", "--email"],
    });
  });

  it("opção repetida é recusada", () => {
    expect(argv("daily", "email&email=0")).toEqual({ erro: "A opção email veio mais de uma vez." });
  });

  it("escreve o comando como no terminal", () => {
    expect(textoDoComando(["daily"])).toBe("pnpm daily");
    expect(textoDoComando(["daily", "--email"])).toBe("pnpm daily -- --email");
    expect(textoDoComando(["publish:monthly", "--correct", "--reason", "Sync atrasado"])).toBe(
      'pnpm publish:monthly -- --correct --reason "Sync atrasado"'
    );
  });

  it("toda flag do mapa é lida pelo CLI, no comando certo", () => {
    const cli = readFileSync(path.resolve(__dirname, "..", "src", "cli.ts"), "utf-8");
    for (const { cli: comando, flags } of Object.values(COMANDOS_HTTP)) {
      expect(cli).toContain(`case "${comando}":`);
      for (const f of Object.keys(flags)) expect(cli).toContain(`"--${f}"`);
    }
  });
});

describe("token do disparo", () => {
  const certo = "a".repeat(64);

  it("confere só o token exato", () => {
    expect(tokenConfere(certo, certo)).toBe(true);
    expect(tokenConfere(`${certo}a`, certo)).toBe(false);
    expect(tokenConfere("b".repeat(64), certo)).toBe(false);
    expect(tokenConfere("", certo)).toBe(false);
    expect(tokenConfere(null, certo)).toBe(false);
    expect(tokenConfere(certo, "")).toBe(false);
  });

  it("lê o Bearer do cabeçalho", () => {
    expect(tokenDoCabecalho(`Bearer ${certo}`)).toBe(certo);
    expect(tokenDoCabecalho(`bearer ${certo}`)).toBe(certo);
    expect(tokenDoCabecalho(certo)).toBeNull();
    expect(tokenDoCabecalho(`Basic ${certo}`)).toBeNull();
    expect(tokenDoCabecalho(`Bearer ${certo} outro`)).toBeNull();
    expect(tokenDoCabecalho(null)).toBeNull();
  });
});
