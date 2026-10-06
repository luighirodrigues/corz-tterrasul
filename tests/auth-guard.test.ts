import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Toda rota, página e ação de servidor confere o acesso. O proxy só olha se o cookie existe; quem valida a sessão
 * é o `src/auth/dal.ts`. Uma rota nova sem a checagem quebra este teste.
 */
const SRC = path.resolve(__dirname, "..", "src");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    return statSync(p).isDirectory() ? arquivos(p) : [p];
  });
}
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");
const todos = arquivos(SRC).filter((f) => !f.includes(`${path.sep}generated${path.sep}`));
const ler = (f: string) => readFileSync(f, "utf-8");

describe("controle de acesso", () => {
  it("toda rota da API chama authorizeApi", () => {
    const rotas = todos.filter((f) => /app\/api\/.*route\.ts$/.test(rel(f)));
    expect(rotas.length).toBeGreaterThanOrEqual(7);
    expect(rotas.filter((f) => !ler(f).includes("authorizeApi(")).map(rel)).toEqual([]);
  });

  it("toda página, fora do login, chama requireUser ou requireAdmin", () => {
    const paginas = todos.filter((f) => /app\/.*page\.tsx$/.test(rel(f)) && !rel(f).startsWith("app/login/"));
    expect(paginas.map(rel)).toEqual(expect.arrayContaining(["app/page.tsx", "app/status/page.tsx", "app/usuarios/page.tsx", "app/trocar-senha/page.tsx"]));
    expect(paginas.filter((f) => !/require(User|Admin)\(/.test(ler(f))).map(rel)).toEqual([]);
  });

  it("toda ação de servidor exportada chama requireUser ou requireAdmin, menos entrar", () => {
    const acoes = todos.filter((f) => /\.tsx?$/.test(f) && /^\s*["']use server["']/.test(ler(f)));
    expect(acoes.map(rel)).toEqual(expect.arrayContaining(["app/login/actions.ts", "app/trocar-senha/actions.ts", "app/usuarios/actions.ts"]));

    const sem: string[] = [];
    for (const f of acoes) {
      // Cada função exportada vai até a próxima: o corpo dela tem de conter a checagem.
      const partes = ler(f).split(/^export (?:async )?function /m).slice(1);
      expect(partes.length).toBeGreaterThan(0);
      for (const corpo of partes) {
        const nome = corpo.match(/^(\w+)/)?.[1];
        if (nome === "entrar") continue;
        if (!/require(User|Admin)\(/.test(corpo)) sem.push(`${rel(f)}: ${nome}`);
      }
    }
    expect(sem).toEqual([]);
  });

  it("os arquivos de sessão só rodam no servidor", () => {
    for (const f of ["auth/session.ts", "auth/dal.ts"]) expect(ler(path.join(SRC, f))).toMatch(/^import "server-only";/m);
  });

  it("o Basic Auth saiu do código", () => {
    expect(todos.filter((f) => /BASIC_AUTH/.test(ler(f))).map(rel)).toEqual([]);
  });
});
