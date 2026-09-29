import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlwClient } from "../src/flw/flw-client.js";

describe("FlwClient - listPanelCards", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ pageNumber: 1, pageSize: 100, hasMorePages: false, items: [] }),
    } as any);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("deve incluir Statuses=OPEN, WON e LOST por padrão", async () => {
    const client = new FlwClient({ token: "test-token" });
    await client.listPanelCards("panel-uuid-123");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = new URL((globalThis.fetch as any).mock.calls[0][0]);

    expect(calledUrl.searchParams.get("PanelId")).toBe("panel-uuid-123");
    expect(calledUrl.searchParams.getAll("Statuses")).toEqual(["OPEN", "WON", "LOST"]);
    expect(calledUrl.searchParams.get("PageSize")).toBe("100");
    expect(calledUrl.searchParams.get("PageNumber")).toBe("1");
  });

  it("deve incluir CreatedAt.After e CreatedAt.Before quando especificados", async () => {
    const client = new FlwClient({ token: "test-token" });
    await client.listPanelCards({
      panelId: "panel-uuid-123",
      createdAtAfter: "2026-09-01T00:00:00Z",
      createdAtBefore: "2026-09-25T23:59:59Z",
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = new URL((globalThis.fetch as any).mock.calls[0][0]);

    expect(calledUrl.searchParams.get("PanelId")).toBe("panel-uuid-123");
    expect(calledUrl.searchParams.getAll("Statuses")).toEqual(["OPEN", "WON", "LOST"]);
    expect(calledUrl.searchParams.get("CreatedAt.After")).toBe("2026-09-01T00:00:00Z");
    expect(calledUrl.searchParams.get("CreatedAt.Before")).toBe("2026-09-25T23:59:59Z");
    expect(calledUrl.searchParams.getAll("IncludeDetails")).toEqual([
      "PanelTitle",
      "StepTitle",
      "StepPhase",
      "ResponsibleUser",
      "Contacts",
      "LostReason",
    ]);
  });

  it("deve permitir sobrescrever os status se desejado", async () => {
    const client = new FlwClient({ token: "test-token" });
    await client.listPanelCards({
      panelId: "panel-uuid-123",
      statuses: ["WON"],
    });

    const calledUrl = new URL((globalThis.fetch as any).mock.calls[0][0]);
    expect(calledUrl.searchParams.getAll("Statuses")).toEqual(["WON"]);
  });

  it("deve enviar UpdatedAt.After quando informado (sync incremental)", async () => {
    const client = new FlwClient({ token: "test-token" });
    await client.listPanelCards({ panelId: "p", updatedAtAfter: "2026-09-20T00:00:00Z" });
    const calledUrl = new URL((globalThis.fetch as any).mock.calls[0][0]);
    expect(calledUrl.searchParams.get("UpdatedAt.After")).toBe("2026-09-20T00:00:00Z");
  });
});
