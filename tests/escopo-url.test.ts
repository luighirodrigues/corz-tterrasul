import { describe, expect, it } from "vitest";
import { escopoParaUrl, lerEscopoUrl } from "../src/lib/escopo-url.js";

describe("escopo no endereço do painel", () => {
  it("lê tipo:id e guarda o id inteiro (com acento e dois-pontos)", () => {
    expect(lerEscopoUrl("equipe:Peças")).toEqual({ scopeType: "equipe", scopeId: "Peças" });
    expect(lerEscopoUrl("painel:abc-123")).toEqual({ scopeType: "painel", scopeId: "abc-123" });
    expect(lerEscopoUrl("divisao:carros")).toEqual({ scopeType: "divisao", scopeId: "carros" });
    expect(lerEscopoUrl("equipe:A:B")).toEqual({ scopeType: "equipe", scopeId: "A:B" });
  });

  it("recusa o Geral, o atendente e o que não tem forma de escopo", () => {
    for (const x of [null, undefined, "", "geral", "geral:geral", "agente:123", "equipe", "equipe:", "equipe:  ", "outro:x"]) {
      expect(lerEscopoUrl(x)).toBeNull();
    }
  });

  it("escreve só os escopos do menu: o Geral e o atendente não entram", () => {
    expect(escopoParaUrl({ scopeType: "equipe", scopeId: "Peças" })).toBe("equipe:Peças");
    expect(escopoParaUrl({ scopeType: "geral", scopeId: "geral" })).toBeNull();
    expect(escopoParaUrl({ scopeType: "agente", scopeId: "u1" })).toBeNull();
  });
});
