import { describe, expect, it } from "vitest";
import { pontoMaisFraco, textoComparacao } from "../src/lib/resumo.js";

const medias = { atrito: 8.4, solucao: 7.1, necessidade: 8, proximoPasso: 6.2, resolvida: 5.6 };

describe("resumo", () => {
  it("pontoMaisFraco pega o critério de menor média e ignora os sem nota", () => {
    expect(pontoMaisFraco(medias)).toEqual({ label: "Conversa resolvida", media: 5.6 });
    expect(pontoMaisFraco({ ...medias, resolvida: null })).toEqual({ label: "Combinou o próximo passo", media: 6.2 });
    expect(pontoMaisFraco({ atrito: null, solucao: null, necessidade: null, proximoPasso: null, resolvida: null })).toBeNull();
  });

  it("textoComparacao diz a diferença por extenso", () => {
    expect(textoComparacao(0.3, "semana")).toBe("0,3 acima da semana anterior");
    expect(textoComparacao(-1.2, "semana")).toBe("1,2 abaixo da semana anterior");
    expect(textoComparacao(0, "semana")).toBe("Igual à semana anterior");
    expect(textoComparacao(0.5, "mes", "agosto")).toBe("0,5 acima de agosto");
    expect(textoComparacao(0, "mes", "agosto")).toBe("Igual a agosto");
    expect(textoComparacao(-0.1, "mes")).toBe("0,1 abaixo do mês anterior");
  });
});
