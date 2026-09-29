import { describe, expect, it } from "vitest";
import { computeSessionMetrics, median, type TimedMessage } from "../src/domain/session-metrics.js";
import { isAutomatedMessage, isClientMessage, isHumanOperatorMessage } from "../src/domain/message-kind.js";
import { classifyLostReason, closingRate, tallyCards } from "../src/domain/lost-reasons.js";
import { resolveSessionPanel } from "../src/domain/session-panel.js";

const at = (hhmm: string, day = "2026-09-24") => new Date(`${day}T${hhmm}:00Z`);
const m = (
  direction: "FROM_HUB" | "TO_HUB",
  ts: Date,
  origin = "DEFAULT",
  type = "TEXT",
  status: string | null = "SENT"
): TimedMessage => ({ direction, origin, type, status, timestamp: ts });

const session = (status = "COMPLETED", over: any = {}) => ({
  status,
  startAt: at("14:00"),
  endAt: at("15:00"),
  firstResponseAt: null,
  timeService: null,
  ...over,
});

describe("message-kind", () => {
  it("só origin DEFAULT é humano; as demais origens são automáticas", () => {
    for (const origin of ["BOT", "OFFICE_HOURS", "CAMPAIGN", "API", "PAYMENT"]) {
      expect(isHumanOperatorMessage(m("TO_HUB", at("10:00"), origin))).toBe(false);
      expect(isAutomatedMessage(m("TO_HUB", at("10:00"), origin))).toBe(true);
    }
    expect(isHumanOperatorMessage(m("TO_HUB", at("10:00")))).toBe(true);
  });

  it("direction é do ponto de vista do canal: FROM_HUB = cliente; TO_HUB = loja", () => {
    expect(isClientMessage(m("FROM_HUB", at("10:00"), "GATEWAY"))).toBe(true);
    expect(isClientMessage(m("TO_HUB", at("10:00")))).toBe(false);
  });

  it("atendente digitando direto no WhatsApp (TO_HUB + GATEWAY) é humano", () => {
    expect(isHumanOperatorMessage(m("TO_HUB", at("10:00"), "GATEWAY"))).toBe(true);
    expect(isAutomatedMessage(m("TO_HUB", at("10:00"), "GATEWAY"))).toBe(false);
  });

  it("mensagem do cliente (FROM_HUB) nunca é resposta humana", () => {
    expect(isHumanOperatorMessage(m("FROM_HUB", at("10:00"), "GATEWAY"))).toBe(false);
  });

  it("nota interna e mensagem falha não são resposta humana", () => {
    expect(isHumanOperatorMessage(m("TO_HUB", at("10:00"), "DEFAULT", "NOTE"))).toBe(false);
    expect(isHumanOperatorMessage(m("TO_HUB", at("10:00"), "DEFAULT", "TEXT", "FAILED"))).toBe(false);
  });
});

describe("computeSessionMetrics - TMR", () => {
  it("resposta automática de fora do horário não conta como 1ª resposta humana", () => {
    const r = computeSessionMetrics(session(), [
      m("FROM_HUB", at("22:00")),
      m("TO_HUB", at("22:00"), "OFFICE_HOURS"),
      m("TO_HUB", at("08:00", "2026-09-25")),
    ]);
    expect(r.tmrSeconds).toBe(10 * 3600);
  });

  it("bot antes do humano não conta", () => {
    const r = computeSessionMetrics(session(), [
      m("FROM_HUB", at("14:00")),
      m("TO_HUB", at("14:00"), "BOT"),
      m("TO_HUB", at("14:05")),
    ]);
    expect(r.tmrSeconds).toBe(300);
  });

  it("nota interna não é resposta ao cliente", () => {
    const r = computeSessionMetrics(session(), [
      m("FROM_HUB", at("14:00")),
      m("TO_HUB", at("14:01"), "DEFAULT", "NOTE"),
      m("TO_HUB", at("14:10")),
    ]);
    expect(r.tmrSeconds).toBe(600);
  });

  it("sem mensagens no espelho usa o campo da sessão e sinaliza fallback", () => {
    const r = computeSessionMetrics(
      session("COMPLETED", { startAt: at("14:00"), firstResponseAt: at("14:03") }),
      []
    );
    expect(r.tmrSeconds).toBe(180);
    expect(r.tmrFromFallback).toBe(true);
  });

  it("atendimento iniciado pela loja não tem TMR nem sem-resposta", () => {
    const r = computeSessionMetrics(session("IN_PROGRESS"), [m("TO_HUB", at("14:00"))]);
    expect(r.tmrSeconds).toBeNull();
    expect(r.semResposta).toBe(false);
  });
});

describe("computeSessionMetrics - sem resposta (D2)", () => {
  it("cliente nunca respondido: conta", () => {
    expect(computeSessionMetrics(session("IN_PROGRESS"), [m("FROM_HUB", at("14:00"))]).semResposta).toBe(true);
  });

  it("'ok, obrigado' no fim de uma COMPLETED não conta", () => {
    const r = computeSessionMetrics(session("COMPLETED"), [
      m("FROM_HUB", at("14:00")),
      m("TO_HUB", at("14:02")),
      m("FROM_HUB", at("14:30")),
    ]);
    expect(r.semResposta).toBe(false);
  });

  it("sessão aberta com o cliente por último: conta", () => {
    const r = computeSessionMetrics(session("IN_PROGRESS"), [
      m("FROM_HUB", at("14:00")),
      m("TO_HUB", at("14:02")),
      m("FROM_HUB", at("14:30")),
    ]);
    expect(r.semResposta).toBe(true);
  });

  it("só bot respondeu: conta como sem resposta humana", () => {
    const r = computeSessionMetrics(session("COMPLETED"), [
      m("FROM_HUB", at("14:00")),
      m("TO_HUB", at("14:00"), "BOT"),
    ]);
    expect(r.semResposta).toBe(true);
  });
});

describe("computeSessionMetrics - reativação e FTR", () => {
  it("gap de 24h seguido de fala humana é reativação", () => {
    const r = computeSessionMetrics(session(), [
      m("FROM_HUB", at("14:00")),
      m("TO_HUB", at("14:05")),
      m("TO_HUB", at("15:00", "2026-09-26")),
    ]);
    expect(r.reativada).toBe(true);
  });

  it("gap de 24h seguido de campanha/bot NÃO é reativação", () => {
    for (const origin of ["CAMPAIGN", "BOT"]) {
      const r = computeSessionMetrics(session(), [
        m("FROM_HUB", at("14:00")),
        m("TO_HUB", at("14:05")),
        m("TO_HUB", at("15:00", "2026-09-26"), origin),
      ]);
      expect(r.reativada).toBe(false);
    }
  });

  it("gap de 24h seguido de fala do cliente não é reativação da loja", () => {
    const r = computeSessionMetrics(session(), [m("TO_HUB", at("14:00")), m("FROM_HUB", at("15:00", "2026-09-26"))]);
    expect(r.reativada).toBe(false);
  });

  it("FTR só para COMPLETED", () => {
    expect(computeSessionMetrics(session("COMPLETED"), []).ftrSeconds).toBe(3600);
    expect(computeSessionMetrics(session("IN_PROGRESS"), []).ftrSeconds).toBeNull();
  });

  it("mediana", () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("lost-reasons (M18)", () => {
  const lists = { outOfControl: ["falta de peca fornecedor"], hygiene: ["duplicado"] };

  it("casa exato e normalizado; substring não casa", () => {
    expect(classifyLostReason("Falta de Peça Fornecedor", lists)).toBe("outOfControl");
    expect(classifyLostReason("Duplicado", lists)).toBe("hygiene");
    expect(classifyLostReason("Duplicado por engano do vendedor", lists)).toBe("counted");
  });

  it("perdas desconsideradas ficam fora do denominador do fechamento", () => {
    const t = tallyCards(
      [
        { status: "WON" },
        { status: "OPEN" },
        { status: "LOST", lostReason: "Preço" },
        { status: "LOST", lostReason: "Duplicado" },
        { status: "LOST", lostReason: "falta de peça fornecedor" },
      ],
      lists
    );
    expect(t).toMatchObject({ won: 1, open: 1, lost: 1, lostHygiene: 1, lostOutOfControl: 1 });
    expect(closingRate(t)).toBe(33.3);
  });

  it("sem cards: taxa nula", () => {
    expect(closingRate(tallyCards([], lists))).toBeNull();
  });
});

describe("session-panel (M11)", () => {
  const own = ["p1", "p2"];
  it("sem card nos painéis do tenant = sem esteira", () => {
    expect(resolveSessionPanel([], own).panelId).toBeNull();
    expect(resolveSessionPanel([{ panelId: "outro", status: "OPEN" }], own).panelId).toBeNull();
  });

  it("vários cards: usa o mais recente e informa duplicidade", () => {
    const r = resolveSessionPanel(
      [
        { panelId: "p1", status: "OPEN", stepTitle: "A", flwUpdatedAt: new Date("2026-09-01") },
        { panelId: "p2", status: "WON", stepTitle: "B", flwUpdatedAt: new Date("2026-09-10") },
      ],
      own
    );
    expect(r).toMatchObject({ panelId: "p2", stepTitle: "B", duplicateCards: 1 });
  });
});
