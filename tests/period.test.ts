import { describe, expect, it } from "vitest";
import {
  isClosed,
  lastClosedMonth,
  lastClosedPeriod,
  monthContaining,
  monthKey,
  parseFreePeriod,
  parseMonth,
  periodContaining,
  previousMonth,
  previousOf,
  previousPeriod,
  weeksOfMonth,
} from "../src/domain/period.js";

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

describe("period: mês do calendário", () => {
  it("setembro de 2026 vai de 01/09 03:00Z a 01/10 02:59:59.999Z", () => {
    const m = monthContaining(new Date("2026-09-15T12:00:00-03:00"), TZ);
    expect(m.granularity).toBe("mes");
    expect(m.label).toBe("2026-09-01 a 2026-09-30");
    expect(m.start.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(m.end.toISOString()).toBe("2026-10-01T02:59:59.999Z");
  });

  it("meses de 28, 29, 30 e 31 dias", () => {
    expect(monthContaining(new Date("2027-02-10T12:00:00-03:00"), TZ).label).toBe("2027-02-01 a 2027-02-28");
    expect(monthContaining(new Date("2028-02-10T12:00:00-03:00"), TZ).label).toBe("2028-02-01 a 2028-02-29");
    expect(monthContaining(new Date("2026-04-10T12:00:00-03:00"), TZ).label).toBe("2026-04-01 a 2026-04-30");
    expect(monthContaining(new Date("2026-10-10T12:00:00-03:00"), TZ).label).toBe("2026-10-01 a 2026-10-31");
  });

  it("meses consecutivos não se sobrepõem nem deixam lacuna, inclusive na virada de ano", () => {
    const jan = monthContaining(new Date("2027-01-20T12:00:00-03:00"), TZ);
    const dez = previousMonth(jan, TZ);
    expect(dez.label).toBe("2026-12-01 a 2026-12-31");
    expect(dez.end.getTime() + 1).toBe(jan.start.getTime());
  });

  it("dia 1º às 00:00 local já é do mês novo; 23:59:59 do último dia ainda é do mês velho", () => {
    expect(monthContaining(new Date("2026-10-01T00:00:00-03:00"), TZ).label).toBe("2026-10-01 a 2026-10-31");
    expect(monthContaining(new Date("2026-09-30T23:59:59-03:00"), TZ).label).toBe("2026-09-01 a 2026-09-30");
  });

  it("último mês encerrado: em 02/10/2026 é setembro; em 30/09 ainda é agosto", () => {
    expect(lastClosedMonth(new Date("2026-10-02T09:00:00-03:00"), TZ).label).toBe("2026-09-01 a 2026-09-30");
    expect(lastClosedMonth(new Date("2026-09-30T23:00:00-03:00"), TZ).label).toBe("2026-08-01 a 2026-08-31");
  });

  it("parseMonth lê AAAA-MM e recusa o resto", () => {
    expect(parseMonth("2026-09", TZ).label).toBe("2026-09-01 a 2026-09-30");
    expect(monthKey(parseMonth("2026-09", TZ), TZ)).toBe("2026-09");
    expect(() => parseMonth("2026-13", TZ)).toThrow();
    expect(() => parseMonth("setembro", TZ)).toThrow();
  });

  it("previousOf volta uma semana ou um mês, e recusa período livre", () => {
    const semana = periodContaining(new Date("2026-09-29T12:00:00-03:00"), TZ);
    expect(previousOf(semana, TZ).label).toBe("2026-09-16 a 2026-09-22");
    expect(previousOf(parseMonth("2026-03", TZ), TZ).label).toBe("2026-02-01 a 2026-02-28");
    expect(() => previousOf({ ...semana, granularity: "livre" }, TZ)).toThrow();
  });
});

describe("period: semanas do mês (D7)", () => {
  const starts = (mes: string) => weeksOfMonth(parseMonth(mes, TZ), TZ, 3).map((w) => w.label.slice(0, 10));

  it("setembro de 2026 tem as semanas de 02, 09, 16 e 23/09 (a de 30/09 fica em outubro)", () => {
    expect(starts("2026-09")).toEqual(["2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23"]);
  });

  it("outubro de 2026 tem 5 semanas, de 30/09 a 28/10", () => {
    expect(starts("2026-10")).toEqual(["2026-09-30", "2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"]);
  });

  it("toda semana pertence a exatamente um mês", () => {
    const owners = new Map<string, number>();
    for (let m = 1; m <= 12; m++) {
      for (const s of starts(`2026-${String(m).padStart(2, "0")}`)) owners.set(s, (owners.get(s) ?? 0) + 1);
    }
    expect([...owners.values()].every((n) => n === 1)).toBe(true);
    for (let m = 1; m <= 12; m++) expect([4, 5]).toContain(starts(`2026-${String(m).padStart(2, "0")}`).length);
  });

  it("respeita outro dia de início de semana (segunda)", () => {
    const w = weeksOfMonth(parseMonth("2026-09", TZ), TZ, 1).map((x) => x.label.slice(0, 10));
    // semana de segunda: o 4º dia é quinta
    expect(w).toEqual(["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"]);
  });
});

describe("period: período livre (L-D4)", () => {
  const now = new Date("2026-10-02T10:00:00-03:00");

  it("de às 00:00 e até às 23:59:59.999 no fuso do tenant", () => {
    const r = parseFreePeriod({ de: "2026-09-05", ate: "2026-09-10", now, tz: TZ });
    expect(r.period.granularity).toBe("livre");
    expect(r.period.start.toISOString()).toBe("2026-09-05T03:00:00.000Z");
    expect(r.period.end.toISOString()).toBe("2026-09-11T02:59:59.999Z");
    expect(r.includesToday).toBe(false);
    expect(r.adjustedToGoLive).toBe(false);
  });

  it("aceita terminar hoje e avisa que inclui hoje", () => {
    expect(parseFreePeriod({ de: "2026-10-02", ate: "2026-10-02", now, tz: TZ }).includesToday).toBe(true);
  });

  it("recusa fim depois de hoje, fim antes do início e datas malformadas", () => {
    expect(() => parseFreePeriod({ de: "2026-10-01", ate: "2026-10-03", now, tz: TZ })).toThrow(/depois de hoje/);
    expect(() => parseFreePeriod({ de: "2026-09-10", ate: "2026-09-05", now, tz: TZ })).toThrow(/anterior/);
    expect(() => parseFreePeriod({ de: "10/09/2026", ate: "2026-09-12", now, tz: TZ })).toThrow(/inválida/);
    expect(() => parseFreePeriod({ de: "2026-02-30", ate: "2026-03-02", now, tz: TZ })).toThrow(/inválida/);
  });

  it("limita a 366 dias (inclusive o 366º)", () => {
    expect(() => parseFreePeriod({ de: "2025-10-02", ate: "2026-10-02", now, tz: TZ })).not.toThrow(); // 366 dias
    expect(() => parseFreePeriod({ de: "2025-10-01", ate: "2026-10-02", now, tz: TZ })).toThrow(/366/);
  });

  it("início antes do go-live é cortado nele, com aviso; fim antes do go-live é erro", () => {
    const goLiveAt = new Date("2026-09-15T00:00:00-03:00");
    const r = parseFreePeriod({ de: "2026-09-01", ate: "2026-09-20", now, tz: TZ, goLiveAt });
    expect(r.adjustedToGoLive).toBe(true);
    expect(r.period.label).toBe("2026-09-15 a 2026-09-20");
    expect(() => parseFreePeriod({ de: "2026-09-01", ate: "2026-09-10", now, tz: TZ, goLiveAt })).toThrow(/Não há dados/);
  });
});
