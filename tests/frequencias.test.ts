import { describe, expect, it } from "vitest";
import { FREQUENCIAS, blocoEntra, recebe, textoFrequencias } from "../src/email/frequencias";

const todas = { resumoDia: true, resumoSemana: true, resumoMes: true };
const padrao = { resumoDia: false, resumoSemana: true, resumoMes: true };
const nenhuma = { resumoDia: false, resumoSemana: false, resumoMes: false };

describe("frequências", () => {
  it("a ordem da tela é diário, semanal, mensal", () => {
    expect(FREQUENCIAS.map((f) => f.rotulo)).toEqual(["Diário", "Semanal", "Mensal"]);
  });

  it("recebe: olha a caixa daquela frequência", () => {
    expect(recebe(padrao, "dia")).toBe(false);
    expect(recebe(padrao, "semana")).toBe(true);
    expect(recebe(padrao, "mes")).toBe(true);
    expect(recebe({ ...nenhuma, resumoDia: true }, "dia")).toBe(true);
  });

  it("texto para a lista de usuários", () => {
    expect(textoFrequencias(todas)).toBe("diário, semanal e mensal");
    expect(textoFrequencias(padrao)).toBe("semanal e mensal");
    expect(textoFrequencias({ ...nenhuma, resumoSemana: true })).toBe("só o semanal");
    expect(textoFrequencias({ ...nenhuma, resumoDia: true })).toBe("só o diário");
    expect(textoFrequencias(nenhuma)).toBe("nenhuma frequência");
  });
});

describe("blocoEntra", () => {
  const vazioGeral = { scopeType: "geral", notaGeral: null, sinteticos: { n: 0 } };
  const vazioEquipe = { scopeType: "equipe", notaGeral: null, sinteticos: { n: 0 } };
  const comNota = { scopeType: "equipe", notaGeral: 7.2, sinteticos: { n: 12 } };
  const soConversasSemNota = { scopeType: "equipe", notaGeral: null, sinteticos: { n: 4 } };

  it("no dia, só entra com nota — inclusive o Geral (domingo sem atendimento)", () => {
    expect(blocoEntra(vazioGeral, "dia")).toBe(false);
    expect(blocoEntra(vazioEquipe, "dia")).toBe(false);
    expect(blocoEntra(soConversasSemNota, "dia")).toBe(false);
    expect(blocoEntra(comNota, "dia")).toBe(true);
    expect(blocoEntra({ ...vazioGeral, notaGeral: 8 }, "dia")).toBe(true);
  });

  it("na semana e no mês, o Geral entra sempre e o resto segue o conteúdo", () => {
    for (const g of ["semana", "mes"] as const) {
      expect(blocoEntra(vazioGeral, g)).toBe(true);
      expect(blocoEntra(vazioEquipe, g)).toBe(false);
      expect(blocoEntra(soConversasSemNota, g)).toBe(true);
      expect(blocoEntra({ ...vazioEquipe, funil: { open: 1, won: 0, lost: 0 } }, g)).toBe(true);
    }
  });
});
