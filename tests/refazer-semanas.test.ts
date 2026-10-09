import { describe, expect, it } from "vitest";
import { planoRefazerSemanas } from "../src/domain/refazer-semanas.js";

const TZ = "America/Sao_Paulo";
const d = (iso: string) => new Date(`${iso}T00:00:00-03:00`);
const rotulos = (p: ReturnType<typeof planoRefazerSemanas>) => p.semanas.map((s) => s.label);
// Sexta, 09/10/2026: a última semana de segunda a domingo encerrada é 28/09 a 04/10.
const now = new Date("2026-10-09T10:00:00-03:00");

describe("semanas:refazer", () => {
  it("apaga as semanas de quarta a terça e refaz de segunda a domingo, desde a mais antiga", () => {
    const p = planoRefazerSemanas({ publicadas: [d("2026-09-23"), d("2026-09-16"), d("2026-09-23")], now, tz: TZ, weekStart: 1 });
    expect(p.apagar).toEqual([d("2026-09-16"), d("2026-09-23")]);
    expect(rotulos(p)).toEqual(["2026-09-14 a 2026-09-20", "2026-09-21 a 2026-09-27", "2026-09-28 a 2026-10-04"]);
  });

  it("rodar de novo depois de apagar dá as mesmas semanas e não apaga nada", () => {
    const p = planoRefazerSemanas({ publicadas: [d("2026-09-14"), d("2026-09-21")], now, tz: TZ, weekStart: 1 });
    expect(p.apagar).toEqual([]);
    expect(rotulos(p)).toEqual(["2026-09-14 a 2026-09-20", "2026-09-21 a 2026-09-27", "2026-09-28 a 2026-10-04"]);
  });

  it("sem semana publicada, começa no go-live; --desde vale mais que os dois", () => {
    expect(rotulos(planoRefazerSemanas({ publicadas: [], goLive: d("2026-09-24"), now, tz: TZ, weekStart: 1 }))).toEqual([
      "2026-09-21 a 2026-09-27",
      "2026-09-28 a 2026-10-04",
    ]);
    expect(
      rotulos(planoRefazerSemanas({ publicadas: [d("2026-09-16")], goLive: d("2026-09-01"), desde: d("2026-09-30"), now, tz: TZ, weekStart: 1 }))
    ).toEqual(["2026-09-28 a 2026-10-04"]);
  });

  it("sem semana publicada, sem go-live e sem --desde, recusa", () => {
    expect(() => planoRefazerSemanas({ publicadas: [], now, tz: TZ, weekStart: 1 })).toThrow(/--desde/);
  });

  it("nada a publicar quando a primeira semana ainda não fechou", () => {
    expect(planoRefazerSemanas({ publicadas: [], desde: d("2026-10-06"), now, tz: TZ, weekStart: 1 }).semanas).toEqual([]);
  });
});
