import { describe, expect, it } from "vitest";
import { calculateNotaConversa, type Stage1Output } from "../src/jobs/job-d-stage1-analysis.js";

describe("stage1 calculation", () => {
  it("deve calcular a média aritmética simples quando todos os 5 critérios são aplicáveis", () => {
    const data: Stage1Output = {
      atrito: { nota: 8, aplica: true, evidencia: "Sem atrito" },
      solucao: { nota: 7, aplica: true, evidencia: "Solução ofertada" },
      necessidade: { nota: 9, aplica: true, evidencia: "Entendeu bem" },
      proximo_passo: { nota: 6, aplica: true, evidencia: "Passo combinado" },
      resolvida: { nota: 10, aplica: true, evidencia: "Resolvido no diálogo" },
      resumo: "Atendimento exemplar",
    };

    // (8 + 7 + 9 + 6 + 10) / 5 = 40 / 5 = 8.0
    const nota = calculateNotaConversa(data);
    expect(nota).toBe(8.0);
  });

  it("deve redistribuir os pesos ignorando critérios com aplica=false", () => {
    const data: Stage1Output = {
      atrito: { nota: 10, aplica: true, evidencia: "Perfeito" },
      solucao: { nota: 8, aplica: true, evidencia: "OK" },
      necessidade: { nota: 9, aplica: true, evidencia: "OK" },
      proximo_passo: { nota: null, aplica: false, evidencia: "Não se aplica" },
      resolvida: { nota: 9, aplica: true, evidencia: "OK" },
      resumo: "Atendimento sem próximo passo necessário",
    };

    // (10 + 8 + 9 + 9) / 4 = 36 / 4 = 9.0
    const nota = calculateNotaConversa(data);
    expect(nota).toBe(9.0);
  });

  it("deve retornar null se nenhum critério for aplicável", () => {
    const data: Stage1Output = {
      atrito: { nota: null, aplica: false },
      solucao: { nota: null, aplica: false },
      necessidade: { nota: null, aplica: false },
      proximo_passo: { nota: null, aplica: false },
      resolvida: { nota: null, aplica: false },
      resumo: "Nenhum critério aplicável",
    };

    const nota = calculateNotaConversa(data);
    expect(nota).toBeNull();
  });
});
