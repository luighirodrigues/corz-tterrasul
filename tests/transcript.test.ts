import { describe, expect, it } from "vitest";
import { buildTranscript, type TranscriptMessage } from "../src/domain/transcript.js";
import { calculateNotaConversa, normalizeStage1, Stage1OutputSchema, type Stage1Output } from "../src/domain/stage1.js";
import { costUsd, nextRetryDelayMinutes } from "../src/domain/cost.js";

const TZ = "America/Sao_Paulo";
const msg = (over: Partial<TranscriptMessage> & { ts: string }): TranscriptMessage => ({
  timestamp: new Date(over.ts),
  direction: "TO_HUB",
  origin: "DEFAULT",
  type: "TEXT",
  status: "SENT",
  text: "oi",
  transcription: null,
  senderId: null,
  ...over,
});

describe("buildTranscript", () => {
  it("marca nota interna, bot e OFFICE_HOURS; humano leva o nome do atendente", () => {
    const { lines } = buildTranscript(
      [
        msg({ ts: "2026-09-24T17:15:00Z", text: "Boa tarde" }),
        msg({ ts: "2026-09-24T17:15:30Z", direction: "FROM_HUB", origin: "BOT", text: "Transferindo" }),
        msg({ ts: "2026-09-24T17:16:00Z", direction: "FROM_HUB", origin: "OFFICE_HOURS", text: "Fora do horário" }),
        msg({ ts: "2026-09-24T17:17:00Z", direction: "FROM_HUB", text: "Temos sim", senderId: "u1" }),
        msg({ ts: "2026-09-24T17:20:00Z", direction: "FROM_HUB", type: "NOTE", text: "cliente já tem Polo", senderId: "u1" }),
      ],
      { tz: TZ, agentNames: new Map([["u1", "Vinicios"]]) }
    );
    expect(lines.map((l) => l.dir)).toEqual(["cliente", "operacao", "operacao", "operacao", "nota_interna"]);
    expect(lines[1].origin).toBe("BOT");
    expect(lines[2].origin).toBe("OFFICE_HOURS");
    expect(lines[3]).toMatchObject({ origin: "DEFAULT", atendente: "Vinicios" });
    expect(lines[0].t).toBe("2026-09-24 14:15"); // fuso local, com data
  });

  it("o fuso vale numa conversa que cruza a meia-noite", () => {
    const { lines } = buildTranscript(
      [msg({ ts: "2026-09-25T02:30:00Z" }), msg({ ts: "2026-09-25T03:30:00Z" })],
      { tz: TZ }
    );
    expect(lines[0].t).toBe("2026-09-24 23:30");
    expect(lines[1].t).toBe("2026-09-25 00:30");
  });

  it("mídia sem texto vira marcador; áudio sem transcrição é contado", () => {
    const { lines, stats } = buildTranscript(
      [
        msg({ ts: "2026-09-24T10:00:00Z", type: "AUDIO", text: null }),
        msg({ ts: "2026-09-24T10:01:00Z", type: "AUDIO", text: null, transcription: "quero a peça" }),
        msg({ ts: "2026-09-24T10:02:00Z", type: "IMAGE", text: "foto do chassi" }),
        msg({ ts: "2026-09-24T10:03:00Z", type: "DOCUMENT", text: null }),
      ],
      { tz: TZ }
    );
    expect(lines.map((l) => l.text)).toEqual([
      "[áudio sem transcrição]",
      "quero a peça",
      "[imagem] foto do chassi",
      "[documento]",
    ]);
    expect(stats.audioSemTranscricao).toBe(1);
  });

  it("ignora TRANSITION, TRACK e mensagens falhas", () => {
    const { lines } = buildTranscript(
      [
        msg({ ts: "2026-09-24T10:00:00Z", type: "TRANSITION" }),
        msg({ ts: "2026-09-24T10:01:00Z", type: "TRACK" }),
        msg({ ts: "2026-09-24T10:02:00Z", direction: "FROM_HUB", status: "FAILED" }),
        msg({ ts: "2026-09-24T10:03:00Z", text: "ok" }),
      ],
      { tz: TZ }
    );
    expect(lines).toHaveLength(1);
  });

  it("conta atendentes humanos distintos (transferência)", () => {
    const { stats } = buildTranscript(
      [
        msg({ ts: "2026-09-24T10:00:00Z", direction: "FROM_HUB", senderId: "a" }),
        msg({ ts: "2026-09-24T10:01:00Z", direction: "FROM_HUB", senderId: "b" }),
        msg({ ts: "2026-09-24T10:02:00Z", direction: "FROM_HUB", origin: "BOT", senderId: "bot" }),
      ],
      { tz: TZ }
    );
    expect(stats.atendentesHumanos).toBe(2);
  });

  it("anonimiza o texto com nome e telefone do cliente", () => {
    const { lines } = buildTranscript([msg({ ts: "2026-09-24T10:00:00Z", text: "Sou o Carlos, 51 99876-5432" })], {
      tz: TZ,
      anonymize: { clientNames: ["Carlos"] },
    });
    expect(lines[0].text).not.toMatch(/Carlos|99876/);
  });

  it("corta do meio acima do teto, mantém primeira e última e registra as omitidas", () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      msg({ ts: new Date(Date.UTC(2026, 8, 24, 10, i)).toISOString(), text: `mensagem número ${i} com algum texto para ocupar espaço` })
    );
    const { lines, stats } = buildTranscript(many, { tz: TZ, maxTokens: 2000 });
    const total = lines.reduce((s, l) => s + Math.ceil(JSON.stringify(l).length / 3.5), 0);
    expect(total).toBeLessThan(2500);
    expect(stats.truncated).toBe(true);
    expect(stats.messagesOmitted).toBeGreaterThan(100);
    expect(lines[0].text).toContain("número 0 ");
    expect(lines[lines.length - 1].text).toContain("número 499 ");
    const marker = lines.find((l) => l.dir === "sistema");
    expect(marker?.text).toContain(`${stats.messagesOmitted} mensagens omitidas`);
    // numeração contínua nas mensagens reais
    const nums = lines.filter((l) => l.n != null).map((l) => l.n);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });

  it("não corta quando cabe", () => {
    const { stats } = buildTranscript([msg({ ts: "2026-09-24T10:00:00Z" })], { tz: TZ });
    expect(stats.truncated).toBe(false);
  });
});

const out = (over: Partial<Stage1Output> = {}): Stage1Output => ({
  atrito: { nota: 8, aplica: true },
  solucao: { nota: 7, aplica: true },
  necessidade: { nota: 9, aplica: true },
  proximo_passo: { nota: 6, aplica: true },
  resolvida: { nota: 10, aplica: true },
  resumo: "ok",
  ...over,
});

describe("stage1", () => {
  it("nota não inteira é recusada pelo schema", () => {
    const r = Stage1OutputSchema.safeParse({ ...out(), atrito: { nota: 7.5, aplica: true } });
    expect(r.success).toBe(false);
  });

  it("resumo longo não derruba a análise", () => {
    expect(Stage1OutputSchema.safeParse({ ...out(), resumo: "x".repeat(400) }).success).toBe(true);
  });

  it("aplica=true sem nota vira não aplicável; aplica=false descarta a nota", () => {
    const { output, warnings } = normalizeStage1(
      out({ atrito: { nota: null, aplica: true }, solucao: { nota: 5, aplica: false } })
    );
    expect(output.atrito).toMatchObject({ aplica: false, nota: null });
    expect(output.solucao).toMatchObject({ aplica: false, nota: null });
    expect(warnings).toHaveLength(2);
  });

  it("nota fora de 0–10 é limitada com aviso", () => {
    const { output, warnings } = normalizeStage1(out({ atrito: { nota: 12, aplica: true } }));
    expect(output.atrito.nota).toBe(10);
    expect(warnings[0]).toMatch(/limitada/);
  });

  it("média só dos critérios aplicáveis", () => {
    expect(calculateNotaConversa(normalizeStage1(out({ proximo_passo: { nota: null, aplica: false } })).output)).toBe(8.5);
  });
});

describe("cost", () => {
  it("calcula US$ pelos tokens e preços configurados", () => {
    expect(costUsd({ prompt_tokens: 1_000_000, completion_tokens: 500_000 }, { inputPer1M: 0.4, outputPer1M: 1.6 })).toBeCloseTo(1.2);
    expect(costUsd(undefined, { inputPer1M: 1, outputPer1M: 1 })).toBe(0);
  });

  it("backoff dobra e tem teto de 24h", () => {
    expect([1, 2, 3].map(nextRetryDelayMinutes)).toEqual([30, 60, 120]);
    expect(nextRetryDelayMinutes(20)).toBe(1440);
  });
});
