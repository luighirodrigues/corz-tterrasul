import { describe, expect, it } from "vitest";
import { generateReportHtml } from "../src/report/html-reporter.js";

describe("html-reporter", () => {
  it("deve gerar o HTML completo com os blocos da tela Pry", () => {
    const mockReport: any = {
      id: "report-123",
      tenantId: "tterrasul",
      periodStart: new Date("2026-09-10T00:00:00Z"),
      periodEnd: new Date("2026-09-17T23:59:59Z"),
      scopeType: "geral",
      scopeId: "geral",
      preliminar: false,
      sinteticos: {
        tmrMedioFormatado: "4m 15s",
        ftrMedianaFormatada: "2h 10m",
        respClientePct: 82.5,
        semRespostaPct: 17.5,
        taxaFechamentoPct: 21.0,
        reativacaoPct: 14.2,
      },
      qualidade: {
        notaGeral: 7.8,
        n: 45,
        medias: {
          atrito: 8.5,
          solucao: 7.9,
          necessidade: 8.2,
          proximoPasso: 7.0,
          resolvida: 7.4,
        },
        histograma: [0, 0, 1, 2, 3, 5, 8, 12, 10, 4, 0],
      },
      funil: {
        open: 15,
        won: 8,
        lost: 3,
      },
      textoFortes: [
        {
          n_casos: 32,
          texto: "Atendentes demonstraram excelente agilidade inicial e clareza.",
        },
      ],
      textoOps: [
        {
          n_casos: 14,
          texto: "Falta de agendamento firme no encerramento.",
          script_sugerido: "Posso reservar o veículo para você amanhã às 14h?",
        },
      ],
    };

    const html = generateReportHtml(mockReport, "Visão Geral da Loja");

    expect(html).toContain("Visão Geral da Loja");
    expect(html).toContain("4m 15s"); // TMR
    expect(html).toContain("2h 10m"); // FTR
    expect(html).toContain("82.5%"); // Resp. Cliente
    expect(html).toContain("17.5%"); // Sem Resposta
    expect(html).toContain("7.8"); // Nota no anel
    expect(html).toContain("Pouco ou Nenhum Atrito");
    expect(html).toContain("Posso reservar o veículo para você amanhã às 14h?");
  });
});
