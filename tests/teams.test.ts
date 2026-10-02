import { describe, expect, it } from "vitest";
import { assignTeamGroups, countUnassigned, parseIgnoredTeams, parseTeamGroups } from "../src/domain/teams.js";

const flw = [
  { id: "1", name: "Vendas" },
  { id: "2", name: "Sérgio Vendas" },
  { id: "3", name: "Peças" },
  { id: "4", name: "Jorge Peças" },
  { id: "5", name: "Inicio" },
  { id: "6", name: "Nova Fila" },
  { id: "7", name: "Vendas - Amanda" },
];

describe("parseTeamGroups", () => {
  it("lê grupos com nome como escrito e equipes normalizadas", () => {
    expect(parseTeamGroups("Vendas: Vendas; Sérgio Vendas | Pós-venda:  Pós Vendas ;")).toEqual([
      { name: "Vendas", teams: ["vendas", "sergio vendas"] },
      { name: "Pós-venda", teams: ["pos vendas"] },
    ]);
  });

  it("vazio: nenhum grupo (relatório por equipe desligado)", () => {
    expect(parseTeamGroups("")).toEqual([]);
    expect(parseTeamGroups(undefined)).toEqual([]);
    expect(parseTeamGroups(" | ")).toEqual([]);
  });

  it("nome de equipe com hífen não quebra", () => {
    expect(parseTeamGroups("Vendas: Vendas - Amanda")[0].teams).toEqual(["vendas - amanda"]);
  });

  it("aceita o valor com aspas em volta (duplas ou simples)", () => {
    const esperado = [
      { name: "Vendas", teams: ["vendas", "sergio vendas"] },
      { name: "Peças", teams: ["pecas"] },
    ];
    expect(parseTeamGroups('"Vendas: Vendas; Sérgio Vendas | Peças: Peças"')).toEqual(esperado);
    expect(parseTeamGroups("'Vendas: Vendas; Sérgio Vendas | Peças: Peças'")).toEqual(esperado);
    expect(parseTeamGroups('""')).toEqual([]);
  });

  it("falha sem ':'", () => {
    expect(() => parseTeamGroups("Vendas; Peças")).toThrow(/sem ":"/);
  });

  it("falha com grupo sem equipe", () => {
    expect(() => parseTeamGroups("Vendas: ;")).toThrow(/sem nenhuma equipe/);
  });

  it("falha com grupo repetido (sem acento e caixa)", () => {
    expect(() => parseTeamGroups("Peças: Peças | pecas: Jorge Peças")).toThrow(/duas vezes/);
  });

  it("falha com equipe em dois grupos", () => {
    expect(() => parseTeamGroups("Vendas: Vendas | Outros: vendas")).toThrow(/"vendas" está em "Vendas" e em "Outros"/);
  });
});

describe("assignTeamGroups", () => {
  const groups = parseTeamGroups("Vendas: Vendas; Sergio Vendas; Vendas - Amanda | Peças: Peças; Jorge Peças; Leonardo Peças");

  it("casa pelo nome exato, sem acento e caixa", () => {
    const r = assignTeamGroups(flw, groups, parseIgnoredTeams("Inicio"));
    expect(r.groupOf.get("2")).toBe("Vendas");
    expect(r.idsByGroup.get("Vendas")).toEqual(["1", "2", "7"]);
    expect(r.idsByGroup.get("Peças")).toEqual(["3", "4"]);
  });

  it("'Jorge Peças' não cai em 'Peças' por trecho", () => {
    const r = assignTeamGroups([{ id: "4", name: "Jorge Peças" }], parseTeamGroups("Peças: Peças"), []);
    expect(r.groupOf.has("4")).toBe(false);
  });

  it("aponta equipe nova fora dos grupos, mas não as ignoradas", () => {
    const r = assignTeamGroups(flw, groups, parseIgnoredTeams("Inicio"));
    expect(r.unmapped).toEqual([{ id: "6", name: "Nova Fila" }]);
  });

  it("aponta nome do .env que não existe na FLW", () => {
    const r = assignTeamGroups(flw, groups, []);
    expect(r.missing).toEqual(["leonardo pecas"]);
  });

  it("grupo sem equipe na FLW fica com lista vazia", () => {
    const r = assignTeamGroups([], groups, []);
    expect(r.idsByGroup.get("Vendas")).toEqual([]);
  });
});

describe("countUnassigned", () => {
  const groups = parseTeamGroups("Vendas: Vendas");
  const teams = [
    { id: "1", name: "Vendas" },
    { id: "5", name: "Inicio" },
    { id: "6", name: "Nova Fila" },
  ];
  const a = assignTeamGroups(teams, groups, parseIgnoredTeams("Inicio"));
  const known = new Set(teams.map((t) => t.id));

  it("conta só equipes sem grupo e fora das ignoradas, maior primeiro", () => {
    const sessions = [
      { departmentId: "1", departmentName: "Vendas" },
      { departmentId: "5", departmentName: "Inicio" }, // ignorada: não conta
      { departmentId: "6", departmentName: "Nova Fila" },
      { departmentId: "6", departmentName: "Nova Fila" },
      { departmentId: "9", departmentName: "Fila Antiga" }, // não sincronizada
      { departmentId: null, departmentName: null }, // sem equipe: não conta
    ];
    expect(countUnassigned(sessions, a, known)).toEqual([
      { name: "Nova Fila", count: 2 },
      { name: "Fila Antiga", count: 1 },
    ]);
  });
});
