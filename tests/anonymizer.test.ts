import { describe, expect, it } from "vitest";
import { anonymizeText, truncateEvidence } from "../src/utils/anonymizer.js";

describe("anonymizer", () => {
  it("deve mascarar emails no texto", () => {
    const input = "Por favor envie o orçamento para contato@empresa.com.br urgente.";
    const output = anonymizeText(input);
    expect(output).toContain("{{email}}");
    expect(output).not.toContain("contato@empresa.com.br");
  });

  it("deve mascarar telefones em formatos brasileiros", () => {
    const inputs = [
      "Ligue no (51) 99876-5432 amanhã",
      "Meu número é 51988887777",
      "Contato: +55 51 3333-4444",
    ];
    for (const text of inputs) {
      const output = anonymizeText(text);
      expect(output).toContain("{{fone}}");
      expect(output).not.toMatch(/\d{4}[-\s]?\d{4}/);
    }
  });

  it("deve mascarar CPF", () => {
    const input = "O CPF do titular é 123.456.789-00 para emitir a nota fiscal.";
    const output = anonymizeText(input);
    expect(output).toContain("{{cpf}}");
    expect(output).not.toContain("123.456.789-00");
  });

  it("deve mascarar nome do cliente se fornecido", () => {
    const input = "Olá Carlos Eduardo, verificamos seu pedido do Polo.";
    const output = anonymizeText(input, { clientName: "Carlos Eduardo" });
    expect(output).toContain("{{cliente}}");
    expect(output).not.toContain("Carlos");
    expect(output).not.toContain("Eduardo");
  });

  it("deve truncar evidências em 200 caracteres", () => {
    const longText = "A".repeat(300);
    const output = truncateEvidence(longText, 200);
    expect(output.length).toBeLessThanOrEqual(200);
    expect(output.endsWith("...")).toBe(true);
  });
});
