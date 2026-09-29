import { describe, expect, it } from "vitest";
import { evaluateGate } from "../src/domain/publish-gate.js";
import { periodContaining } from "../src/domain/period.js";

const TZ = "America/Sao_Paulo";
const period = periodContaining(new Date("2026-09-17T12:00:00-03:00"), TZ); // 16/09–22/09
const now = new Date("2026-09-24T09:00:00-03:00");
const after = new Date("2026-09-23T04:00:00-03:00");
const ok = { period, now, lastSessionsSync: after, lastCardsSync: after, pendingAnalyses: 0 };

describe("publish gate", () => {
  it("libera quando tudo está em dia", () => {
    expect(evaluateGate(ok)).toEqual({ ok: true, problems: [] });
  });

  it("bloqueia janela aberta", () => {
    const open = periodContaining(new Date("2026-09-24T12:00:00-03:00"), TZ);
    const r = evaluateGate({ ...ok, period: open });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/aberta/);
  });

  it("bloqueia quando o sync de cards é anterior ao fim da janela", () => {
    const r = evaluateGate({ ...ok, lastCardsSync: new Date("2026-09-20T00:00:00-03:00") });
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/cards/);
  });

  it("bloqueia sem nenhum sync", () => {
    const r = evaluateGate({ ...ok, lastSessionsSync: null, lastCardsSync: null });
    expect(r.problems).toHaveLength(2);
  });

  it("bloqueia com sessões sem análise", () => {
    const r = evaluateGate({ ...ok, pendingAnalyses: 37 });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/37/);
  });
});
