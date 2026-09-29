import { describe, expect, it } from "vitest";
import {
  aggregateQuality,
  conversationScore,
  pickCases,
  unavailableCriteria,
  CRITERIA,
  type AnalysisRow,
} from "../src/domain/aggregate.js";

const row = (v: Array<number | null>, resumo = "r"): AnalysisRow => ({
  scores: { atrito: v[0], solucao: v[1], necessidade: v[2], proximoPasso: v[3], resolvida: v[4] },
  resumo,
});
const same = (x: number) => row([x, x, x, x, x]);
const none = () => row([null, null, null, null, null]);
const opts = (n: number) => ({ minCoverage: 0.3, n, nSkipped: 0, nError: 0, nSemEsteira: 0 });

describe("aggregateQuality", () => {
  it("10 conversas nota 8 e 2 sem nota: geral é 8,0 (não 6,7)", () => {
    const rows = [...Array(10).fill(0).map(() => same(8)), none(), none()];
    const q = aggregateQuality(rows, opts(12));
    expect(q.notaGeral).toBe(8);
    expect(q.nDone).toBe(12);
    expect(q.nComNota).toBe(10);
  });

  it("escopo vazio: nota nula, não zero", () => {
    const q = aggregateQuality([], opts(0));
    expect(q.notaGeral).toBeNull();
    expect(q.nComNota).toBe(0);
    expect(q.histograma).toEqual(new Array(11).fill(0));
  });

  it("histograma arredonda a nota da conversa", () => {
    const q = aggregateQuality([same(7), row([7, 8, 7, 8, 7])], opts(2)); // 7 e 7,4
    expect(q.histograma[7]).toBe(2);
  });

  it("critério aplicável em poucas conversas sai da nota e das médias", () => {
    // proximoPasso aplica em 1 de 10 (10% < 30%)
    const rows = Array(10).fill(0).map((_, i) => row([8, 8, 8, i === 0 ? 2 : null, 8]));
    expect(unavailableCriteria(rows, 0.3)).toEqual(["proximoPasso"]);
    const q = aggregateQuality(rows, opts(10));
    expect(q.medias.proximoPasso).toBeNull();
    expect(q.contagens.proximoPasso).toBeNull();
    expect(q.criteriosIndisponiveis).toEqual(["proximoPasso"]);
    expect(q.notaGeral).toBe(8); // o 2 do critério fora não contamina a nota
  });

  it("pesos redistribuídos: nota da conversa usa só os disponíveis", () => {
    const r = row([10, 8, 6, null, 8]);
    expect(conversationScore(r, CRITERIA)).toBe(8);
    expect(conversationScore(r, ["atrito", "solucao"])).toBe(9);
  });

  it("contagens por faixa (base do estágio 2)", () => {
    const rows = [same(2), same(4), same(5), same(7), same(8), same(10)];
    const q = aggregateQuality(rows, opts(6));
    expect(q.contagens.atrito).toEqual({ aplicavel: 6, baixo_0_4: 2, medio_5_7: 2, alto_8_10: 2 });
  });
});

describe("pickCases", () => {
  it("pega metade das piores e metade das melhores, com ids curtos", () => {
    const rows = Array.from({ length: 30 }, (_, i) => row([i % 11, i % 11, i % 11, i % 11, i % 11], `caso ${i}`));
    const cases = pickCases(rows, CRITERIA, 10);
    expect(cases).toHaveLength(10);
    expect(cases.map((c) => c.id)).toEqual(Array.from({ length: 10 }, (_, i) => `c${String(i + 1).padStart(2, "0")}`));
    const notas = cases.map((c) => c.nota);
    expect(Math.min(...notas)).toBe(0);
    expect(Math.max(...notas)).toBe(10);
  });

  it("com poucos casos devolve todos, sem repetir", () => {
    const cases = pickCases([same(3), same(9)], CRITERIA, 10);
    expect(cases).toHaveLength(2);
  });

  it("ignora conversas sem nota ou sem resumo", () => {
    expect(pickCases([none(), row([5, 5, 5, 5, 5], "")], CRITERIA)).toEqual([]);
  });
});

describe("aggregateQuality - forceAvailable (semana anterior com a mesma régua)", () => {
  it("usa o mesmo conjunto de critérios da semana atual, mesmo que na anterior ele tivesse cobertura", () => {
    const rows = Array(10).fill(0).map(() => row([8, 8, 8, 2, 8])); // proximoPasso cobre 100% e puxa para baixo
    const semRegua = aggregateQuality(rows, opts(10));
    expect(semRegua.notaGeral).toBe(6.8);
    const comRegua = aggregateQuality(rows, { ...opts(10), forceAvailable: ["atrito", "solucao", "necessidade", "resolvida"] });
    expect(comRegua.notaGeral).toBe(8);
    expect(comRegua.medias.proximoPasso).toBeNull();
    expect(comRegua.criteriosIndisponiveis).toEqual(["proximoPasso"]);
  });
});
