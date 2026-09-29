import { describe, expect, it } from "vitest";
import { resolvePanelIds } from "../src/domain/panels.js";

const titles = { vendas: "Vendas", campanhas: "Campanhas", pecas: "Peças", oficina: "Oficina" };
const panels = [
  { id: "1", title: "Vendas" },
  { id: "2", title: "campanhas " },
  { id: "3", title: "PECAS" },
  { id: "4", title: "Oficina" },
  { id: "5", title: "Venda de Peças" },
];

describe("resolvePanelIds", () => {
  it("casa por título exato, sem acento e sem caixa", () => {
    expect(resolvePanelIds(panels, { ids: {}, titles })).toEqual({
      vendas: "1",
      campanhas: "2",
      pecas: "3",
      oficina: "4",
    });
  });

  it("'Venda de Peças' não vira Vendas nem Peças", () => {
    const r = resolvePanelIds(panels, { ids: {}, titles });
    expect(Object.values(r)).not.toContain("5");
  });

  it("ID configurado vence o título", () => {
    const r = resolvePanelIds(panels, { ids: { vendas: "zzz" }, titles });
    expect(r.vendas).toBe("zzz");
  });

  it("falha listando os painéis disponíveis quando falta um", () => {
    expect(() => resolvePanelIds(panels.slice(1), { ids: {}, titles })).toThrow(
      /Vendas.*não encontrado[\s\S]*Painéis na FLW/
    );
  });

  it("falha quando o título é ambíguo", () => {
    expect(() =>
      resolvePanelIds([...panels, { id: "9", title: "Oficina" }], { ids: {}, titles })
    ).toThrow(/ambíguo/);
  });
});
