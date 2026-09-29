import { describe, expect, it } from "vitest";
import { isClosed, lastClosedPeriod, periodContaining, previousPeriod } from "../src/domain/period.js";

const TZ = "America/Sao_Paulo"; // UTC-3, sem horário de verão desde 2019

describe("period", () => {
  it("terça 29/09/2026: janela aberta é 23/09–29/09; última fechada é 16/09–22/09", () => {
    const now = new Date("2026-09-29T15:00:00-03:00");
    const cur = periodContaining(now, TZ);
    expect(cur.label).toBe("2026-09-23 a 2026-09-29");
    expect(isClosed(cur, now)).toBe(false);

    const last = lastClosedPeriod(now, TZ);
    expect(last.label).toBe("2026-09-16 a 2026-09-22");
    expect(last.start.toISOString()).toBe("2026-09-16T03:00:00.000Z");
    expect(last.end.toISOString()).toBe("2026-09-23T02:59:59.999Z");
  });

  it("quinta 01/10/2026: última fechada é 23/09–29/09", () => {
    const last = lastClosedPeriod(new Date("2026-10-01T09:00:00-03:00"), TZ);
    expect(last.label).toBe("2026-09-23 a 2026-09-29");
  });

  it("quarta às 00:00 local já pertence à nova janela", () => {
    const p = periodContaining(new Date("2026-09-23T00:00:00-03:00"), TZ);
    expect(p.label).toBe("2026-09-23 a 2026-09-29");
    const before = periodContaining(new Date("2026-09-22T23:59:59-03:00"), TZ);
    expect(before.label).toBe("2026-09-16 a 2026-09-22");
  });

  it("janelas consecutivas não se sobrepõem nem deixam lacuna", () => {
    const cur = periodContaining(new Date("2026-09-29T12:00:00-03:00"), TZ);
    const prev = previousPeriod(cur, TZ);
    expect(prev.end.getTime() + 1).toBe(cur.start.getTime());
  });

  it("respeita outro dia de início de semana (segunda)", () => {
    const p = periodContaining(new Date("2026-09-29T12:00:00-03:00"), TZ, 1);
    expect(p.label).toBe("2026-09-28 a 2026-10-04");
  });

  it("dois cálculos no mesmo dia dão a mesma janela", () => {
    const a = lastClosedPeriod(new Date("2026-09-29T08:00:00-03:00"), TZ);
    const b = lastClosedPeriod(new Date("2026-09-29T22:30:00-03:00"), TZ);
    expect(a.start.getTime()).toBe(b.start.getTime());
    expect(a.end.getTime()).toBe(b.end.getTime());
  });
});
