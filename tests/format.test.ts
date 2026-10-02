import { describe, it, expect } from "vitest";
import {
  fmtAtualizado,
  fmtDadosAte,
  fmtDuracao,
  fmtMes,
  fmtMesCurto,
  fmtNomeMes,
  fmtNota,
  fmtPct,
  fmtPeriodo,
  fmtPeriodoComAno,
  fmtPeriodoCurto,
  fmtTituloPeriodo,
} from "../src/lib/format.js";
import { scoreStatus } from "../src/lib/labels.js";

describe("format", () => {
  it("fmtNota", () => {
    expect(fmtNota(6.6)).toBe("6,6");
    expect(fmtNota(7)).toBe("7,0");
    expect(fmtNota(null)).toBe("—");
  });

  it("fmtPct", () => {
    expect(fmtPct(62.5)).toBe("62,5%");
    expect(fmtPct(69)).toBe("69%");
    expect(fmtPct(undefined)).toBe("—");
  });

  it("fmtDuracao", () => {
    expect(fmtDuracao(26)).toBe("menos de 1 min");
    expect(fmtDuracao(800)).toBe("13 min");
    expect(fmtDuracao(4020)).toBe("1h 07min");
    expect(fmtDuracao(109620)).toBe("1 dia e 6h");
    expect(fmtDuracao(172800)).toBe("2 dias");
    expect(fmtDuracao(null)).toBe("—");
  });

  it("fmtPeriodo não desloca o dia por fuso", () => {
    expect(fmtPeriodo("2026-09-18", "2026-09-24")).toBe("18 a 24 de setembro");
    expect(fmtPeriodo("2026-09-29", "2026-10-05")).toBe("29 de setembro a 5 de outubro");
    expect(fmtPeriodoCurto("2026-09-18", "2026-09-24")).toBe("18 a 24 de set. de 2026");
    expect(fmtPeriodoCurto("2026-09-18T03:00:00.000Z", "2026-09-25T02:59:59.999Z")).toBe("18 a 24 de set. de 2026");
  });

  it("fmtAtualizado", () => {
    const now = new Date("2026-09-30T15:00:00Z");
    expect(fmtAtualizado("2026-09-30T09:00:00Z", now)).toBe("hoje às 06:00");
    expect(fmtAtualizado("2026-09-29T09:00:00Z", now)).toBe("ontem às 06:00");
    expect(fmtAtualizado("2026-09-28T09:00:00Z", now)).toBe("em 28/09 às 06:00");
  });

  it("scoreStatus", () => {
    expect(scoreStatus(8).tone).toBe("good");
    expect(scoreStatus(7.9).tone).toBe("warn");
    expect(scoreStatus(5.9).tone).toBe("bad");
    expect(scoreStatus(null).tone).toBe("neutral");
  });
});

describe("format: mês e período livre", () => {
  it("fmtMes e afins não deslocam o dia por fuso", () => {
    expect(fmtMes("2026-09-01")).toBe("setembro de 2026");
    expect(fmtMes("2026-09-01T03:00:00.000Z")).toBe("setembro de 2026");
    expect(fmtNomeMes("2026-08-01")).toBe("agosto");
    expect(fmtMesCurto("2026-09-01")).toBe("set");
    expect(fmtMesCurto("2026-10-01T03:00:00.000Z")).toBe("out");
  });

  it("fmtPeriodoComAno sempre mostra o ano", () => {
    expect(fmtPeriodoComAno("2026-09-05", "2026-09-10")).toBe("5 a 10 de setembro de 2026");
    expect(fmtPeriodoComAno("2026-09-29", "2026-10-05")).toBe("29 de setembro a 5 de outubro de 2026");
    expect(fmtPeriodoComAno("2025-12-30", "2026-01-05")).toBe("30 de dezembro de 2025 a 5 de janeiro de 2026");
  });

  it("fmtTituloPeriodo por tipo", () => {
    expect(fmtTituloPeriodo("semana", "2026-09-16", "2026-09-22")).toBe("Semana de 16 a 22 de setembro");
    expect(fmtTituloPeriodo("mes", "2026-09-01", "2026-09-30")).toBe("Mês de setembro de 2026");
    expect(fmtTituloPeriodo("livre", "2026-09-05", "2026-09-10")).toBe("Período de 5 a 10 de setembro de 2026");
  });

  it("fmtDadosAte", () => {
    const now = new Date("2026-10-02T15:00:00Z");
    expect(fmtDadosAte("2026-10-02T08:12:00Z", now)).toBe("hoje às 05:12");
    expect(fmtDadosAte("2026-10-01T08:12:00Z", now)).toBe("ontem às 05:12");
    expect(fmtDadosAte("2026-09-28T08:12:00Z", now)).toBe("28/09 às 05:12");
  });
});
