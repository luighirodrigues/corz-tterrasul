import { describe, expect, it } from "vitest";
import { agruparEscopos, chaveEscopo, listSubscribableScopes, rotuloEscopo, temConteudo } from "../src/domain/report-scopes.js";
import { parseTeamGroups } from "../src/domain/teams.js";
import { resolveScopeTitle } from "../src/domain/scope-title.js";
import { nomeEscopo } from "../src/lib/labels.js";

const tenant = { panelVendasId: "pv", panelCampanhasId: "pc", panelPecasId: "pp", panelOficinaId: "po" };
const grupos = parseTeamGroups("Vendas: Vendas; Sérgio Vendas | Peças: Peças | Pós-venda: Pós Vendas | Agendamento: Agendamento | Caixa: Caixa");

describe("escopos que dá para acompanhar por e-mail", () => {
  const lista = listSubscribableScopes(tenant, grupos);

  it("bate com o menu de visão: Geral, divisões, equipes do .env na ordem e os quatro painéis", () => {
    expect(lista.map(chaveEscopo)).toEqual([
      "geral:geral",
      "divisao:carros",
      "divisao:pecas",
      "equipe:Vendas",
      "equipe:Peças",
      "equipe:Pós-venda",
      "equipe:Agendamento",
      "equipe:Caixa",
      "painel:pv",
      "painel:pc",
      "painel:pp",
      "painel:po",
    ]);
  });

  it("o nome é o mesmo que a tela mostra (título do relatório sem o prefixo)", () => {
    for (const e of lista.filter((x) => x.scopeType !== "geral")) {
      expect(e.nome).toBe(nomeEscopo(resolveScopeTitle(e, tenant).title));
    }
    expect(lista.find((e) => e.scopeType === "painel" && e.scopeId === "pp")?.nome).toBe("Peças");
    expect(lista[0].nome).toBe("Visão geral da operação");
  });

  it("o rótulo traz o tipo na frente", () => {
    expect(lista.map((e) => e.rotulo)).toEqual([
      "Geral",
      "Divisão Veículos (Vendas & Campanhas)",
      "Divisão Pós-Venda (Peças & Oficina)",
      "Equipe Vendas",
      "Equipe Peças",
      "Equipe Pós-venda",
      "Equipe Agendamento",
      "Equipe Caixa",
      "Painel Vendas",
      "Painel Campanhas",
      "Painel Peças",
      "Painel Oficina",
    ]);
  });

  it("o escopo do atendente fica de fora", () => {
    expect(lista.some((e) => (e.scopeType as string) === "agente")).toBe(false);
  });

  it("painel sem id no tenant não entra, e sem grupos não há equipes", () => {
    const sem = listSubscribableScopes({ panelVendasId: "pv" }, []);
    expect(sem.map(chaveEscopo)).toEqual(["geral:geral", "divisao:carros", "divisao:pecas", "painel:pv"]);
    expect(listSubscribableScopes(null, []).map(chaveEscopo)).toEqual(["geral:geral", "divisao:carros", "divisao:pecas"]);
  });

  it("agrupa como o menu e some com o grupo vazio", () => {
    expect(agruparEscopos(lista).map((g) => [g.titulo, g.escopos.length])).toEqual([
      ["Geral", 1],
      ["Divisões", 2],
      ["Equipes", 5],
      ["Painéis do CRM", 4],
    ]);
    expect(agruparEscopos(listSubscribableScopes(null, [])).map((g) => g.titulo)).toEqual(["Geral", "Divisões"]);
  });

  it("rotuloEscopo escreve também o que não existe mais", () => {
    expect(rotuloEscopo("equipe", "Comercial", tenant)).toBe("Equipe Comercial");
    expect(rotuloEscopo("painel", "id-antigo", tenant)).toBe("Painel id-antigo");
  });
});

describe("temConteudo", () => {
  const base = { scopeType: "equipe", notaGeral: null, sinteticos: { n: 0 }, funil: null };
  it("Geral sempre fica; o resto precisa de nota, conversa ou negócio", () => {
    expect(temConteudo({ ...base, scopeType: "geral" })).toBe(true);
    expect(temConteudo(base)).toBe(false);
    expect(temConteudo({ ...base, notaGeral: 7.2 })).toBe(true);
    expect(temConteudo({ ...base, sinteticos: { n: 3 } })).toBe(true);
    expect(temConteudo({ ...base, funil: { open: 0, won: 0, lost: 0 } })).toBe(false);
    expect(temConteudo({ ...base, funil: { open: 1, won: 0, lost: 0 } })).toBe(true);
  });
});
