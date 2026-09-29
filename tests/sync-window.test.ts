import { describe, expect, it } from "vitest";
import { resolveSyncWindow } from "../src/domain/sync-window.js";

const now = new Date("2026-09-29T12:00:00Z");
const base = { now, cursor: null, goLiveAt: null, overlapMinutes: 15 };

describe("resolveSyncWindow", () => {
  it("incremental: cursor menos a margem, por UpdatedAt", () => {
    const w = resolveSyncWindow({ ...base, cursor: new Date("2026-09-29T10:00:00Z") });
    expect(w).toEqual({ mode: "incremental", updatedAfter: "2026-09-29T09:45:00.000Z" });
  });

  it("--from vence o cursor e usa CreatedAt", () => {
    const w = resolveSyncWindow({ ...base, cursor: new Date(), fromDate: "2026-09-01" });
    expect(w.mode).toBe("backfill");
    expect(w.createdAfter).toBe("2026-09-01T00:00:00.000Z");
  });

  it("--days faz backfill de N dias", () => {
    const w = resolveSyncWindow({ ...base, lookbackDays: 7 });
    expect(w.createdAfter).toBe("2026-09-22T12:00:00.000Z");
  });

  it("--all não filtra", () => {
    expect(resolveSyncWindow({ ...base, all: true })).toEqual({ mode: "full" });
  });

  it("sem cursor usa o go-live", () => {
    const w = resolveSyncWindow({ ...base, goLiveAt: new Date("2026-09-01T00:00:00Z") });
    expect(w).toEqual({ mode: "backfill", createdAfter: "2026-09-01T00:00:00.000Z" });
  });

  it("sem cursor e sem go-live: erro em vez de supor 7 dias", () => {
    expect(() => resolveSyncWindow(base)).toThrow(/--from/);
  });

  it("data inválida no --from", () => {
    expect(() => resolveSyncWindow({ ...base, fromDate: "xx" })).toThrow(/inválida/);
  });
});
