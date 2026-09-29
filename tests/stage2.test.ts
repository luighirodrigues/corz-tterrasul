import { describe, expect, it } from "vitest";
import { aggregateQuality, CRITERIA, type AnalysisRow } from "../src/domain/aggregate.js";
import { buildStage2Input, finalizeStage2, type RawStage2Output } from "../src/domain/stage2.js";

const row = (v: number): AnalysisRow => ({
  scores: { atrito: v, solucao: v, necessidade: v, proximoPasso: v, resolvida: v },
  resumo: "r",
});

// 6 conversas nota 9 (alto) + 4 conversas nota 2 (baixo) = 10
const rows = [...Array(6).fill(0).map(() => row(9)), ...Array(4).fill(0).map(() => row(2))];
const q = aggregateQuality(rows, { minCoverage: 0.3, n: 10, nSkipped: 0, nError: 0, nSemEsteira: 0 });

const raw = (over: Partial<RawStage2Output> = {}): RawStage2Output => ({
  pontos_fortes: [{ criterio: "necessidade", faixa: "alto", texto: "Em {n_casos} das {n_total} conversas o atendente entendeu o pedido.", script_sugerido: null }],
  oportunidades: [{ criterio: "proximoPasso", faixa: "baixo", texto: "Em {n_casos} das {n_total} conversas faltou combinar o retorno.", script_sugerido: "Posso reservar para amanhã às 10h?" }],
  ...over,
});

describe("finalizeStage2", () => {
  it("o sistema preenche o número: n_casos vem das contagens, não da IA", () => {
    const r = finalizeStage2(raw(), q);
    expect(r.fortes[0]).toMatchObject({ n_casos: 6, n_total: 10 });
    expect(r.fortes[0].texto).toBe("Em 6 das 10 conversas o atendente entendeu o pedido.");
    expect(r.oportunidades[0]).toMatchObject({ n_casos: 4, n_total: 10 });
    expect(r.descartes).toEqual([]);
  });

  it("descarta texto com número inventado ('em 7 das 60')", () => {
    const r = finalizeStage2(
      raw({ pontos_fortes: [{ criterio: "atrito", faixa: "alto", texto: "Em 7 das 60 conversas houve fluidez.", script_sugerido: null }] }),
      q
    );
    expect(r.fortes).toHaveLength(0);
    expect(r.descartes[0]).toMatch(/quantidade não sustentada/);
  });

  it("descarta item com contagem zero na faixa", () => {
    const soAlto = aggregateQuality(Array(10).fill(0).map(() => row(9)), { minCoverage: 0.3, n: 10, nSkipped: 0, nError: 0, nSemEsteira: 0 });
    const r = finalizeStage2(raw(), soAlto);
    expect(r.oportunidades).toHaveLength(0);
    expect(r.descartes.join()).toMatch(/nenhuma conversa/);
  });

  it("descarta faixa na seção errada e critério indisponível", () => {
    const r = finalizeStage2(
      raw({ pontos_fortes: [{ criterio: "atrito", faixa: "baixo", texto: "x {n_casos}", script_sugerido: null }] }),
      q
    );
    expect(r.fortes).toHaveLength(0);

    const rows2 = Array(10).fill(0).map((_, i) => ({ ...row(9), scores: { ...row(9).scores, proximoPasso: i === 0 ? 1 : null } }));
    const q2 = aggregateQuality(rows2, { minCoverage: 0.3, n: 10, nSkipped: 0, nError: 0, nSemEsteira: 0 });
    const r2 = finalizeStage2(raw(), q2);
    expect(r2.descartes.join()).toMatch(/indisponível/);
  });

  it("anonimiza texto e script", () => {
    const r = finalizeStage2(
      raw({ oportunidades: [{ criterio: "proximoPasso", faixa: "baixo", texto: "Em {n_casos} das {n_total} faltou retorno.", script_sugerido: "Ligue para 51 99876-5432" }] }),
      q
    );
    expect(r.oportunidades[0].script_sugerido).not.toMatch(/99876/);
  });
});

describe("buildStage2Input", () => {
  it("traz top_gaps e top_fortes calculados no código", () => {
    const input = buildStage2Input("Geral", q, { tmr: "2m" }, []);
    expect(input.top_gaps).toHaveLength(3);
    expect(input.top_gaps[0].n_baixo).toBe(4);
    expect(input.top_fortes[0].n_alto).toBe(6);
    expect(input.n_conversas_com_nota).toBe(10);
    expect(CRITERIA.every((c) => input.contagens[c])).toBe(true);
  });
});
