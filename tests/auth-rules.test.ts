import { describe, expect, it } from "vitest";
import { caminhoSeguro, fmtUltimoAcesso, motivoNaoDesativar, motivoNaoMudarPerfil, type UsuarioRegra } from "../src/auth/rules";

const u = (id: string, role: "admin" | "usuario", desativado = false): UsuarioRegra => ({ id, role, deactivatedAt: desativado ? new Date() : null });

describe("regras de administrador", () => {
  const todos = [u("ana", "admin"), u("beto", "usuario"), u("cida", "admin", true)];

  it("ninguém desativa a si mesmo", () => {
    expect(motivoNaoDesativar(todos[1], todos, "beto")).toMatch(/seu próprio acesso/);
  });

  it("o último administrador ativo não pode ser desativado, mesmo havendo um desativado", () => {
    expect(motivoNaoDesativar(todos[0], todos, "beto")).toMatch(/único administrador/);
  });

  it("com dois administradores ativos, um pode desativar o outro", () => {
    const dois = [u("ana", "admin"), u("dani", "admin")];
    expect(motivoNaoDesativar(dois[0], dois, "dani")).toBeNull();
  });

  it("desativar um usuário comum é livre", () => {
    expect(motivoNaoDesativar(todos[1], todos, "ana")).toBeNull();
  });

  it("o último administrador ativo não vira usuário comum", () => {
    expect(motivoNaoMudarPerfil(todos[0], "usuario", todos)).toMatch(/único administrador/);
    expect(motivoNaoMudarPerfil(todos[0], "admin", todos)).toBeNull();
    expect(motivoNaoMudarPerfil(todos[1], "admin", todos)).toBeNull();
    const dois = [u("ana", "admin"), u("dani", "admin")];
    expect(motivoNaoMudarPerfil(dois[0], "usuario", dois)).toBeNull();
  });
});

describe("caminho de volta do login", () => {
  it("aceita só caminho interno", () => {
    expect(caminhoSeguro("/usuarios?x=1")).toBe("/usuarios?x=1");
    expect(caminhoSeguro("/")).toBe("/");
    for (const ruim of ["https://outro.site", "//outro.site", "/\\outro.site", "usuarios", "", null, undefined, "/a\r\nSet-Cookie: x=1"]) {
      expect(caminhoSeguro(ruim)).toBe("/");
    }
  });

  it("recusa o que o navegador transforma em outro site", () => {
    // O navegador apaga tab e quebra de linha e lê "\" como "/": todos estes viram "//outro.site".
    for (const ruim of ["/\t/outro.site", "/\n/outro.site", "/\r/outro.site", "/\u0000/outro.site", "/\\\\outro.site", "/x\\..\\..\\/outro.site"]) {
      expect(caminhoSeguro(ruim)).toBe("/");
    }
  });

  it("mantém o endereço do painel com filtros", () => {
    expect(caminhoSeguro("/?tipo=mes&period=2026-09-01")).toBe("/?tipo=mes&period=2026-09-01");
    expect(caminhoSeguro("/?q=Jo%C3%A3o%20%2F%2Fx")).toBe("/?q=Jo%C3%A3o%20%2F%2Fx");
  });
});

describe("último acesso", () => {
  const agora = new Date("2026-10-06T15:00:00Z");
  it("descreve em português", () => {
    expect(fmtUltimoAcesso(null, agora)).toBe("Nunca entrou");
    expect(fmtUltimoAcesso("2026-10-06T11:00:00Z", agora)).toBe("Hoje");
    expect(fmtUltimoAcesso("2026-10-05T20:00:00Z", agora)).toBe("Ontem");
    expect(fmtUltimoAcesso("2026-10-03T15:00:00Z", agora)).toBe("Há 3 dias");
    expect(fmtUltimoAcesso("2026-09-15T15:00:00Z", agora)).toBe("Há 3 semanas");
  });
});
