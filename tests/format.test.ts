import { describe, it, expect } from "vitest";
import { fmtNota, fmtPct, fmtDuracao, fmtPeriodo, fmtPeriodoCurto, fmtAtualizado } from "../src/lib/format.js";
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
