import { prisma } from "../src/db/prisma.js";
import { exportReportHtml } from "../src/report/html-reporter.js";

async function run() {
  const tenant = await prisma.tenant.findFirst();
  const reports = await prisma.periodReport.findMany({
    orderBy: { publishedAt: "desc" },
    distinct: ["scopeType", "scopeId"],
  });

  console.log(`Exportando ${reports.length} relatórios...`);

  for (const rep of reports) {
    const tenant = await prisma.tenant.findUnique({ where: { id: rep.tenantId } });
    const dateStr = rep.periodStart.toISOString().split("T")[0];
    let title = `${rep.scopeType.toUpperCase()} - ${rep.scopeId}`;
    let fileName = `relatorio_${rep.scopeType}_${rep.scopeId}_${dateStr}.html`;

    if (rep.scopeType === "geral") {
      title = "Visão Geral da Operação";
      fileName = `relatorio_geral_operacao_${dateStr}.html`;
    } else if (rep.scopeType === "divisao") {
      if (rep.scopeId === "carros") {
        title = "Divisão Veículos (Vendas & Campanhas)";
        fileName = `relatorio_divisao_veiculos_${dateStr}.html`;
      } else if (rep.scopeId === "pecas") {
        title = "Divisão Pós-Venda (Peças & Oficina)";
        fileName = `relatorio_divisao_posvenda_${dateStr}.html`;
      }
    } else if (rep.scopeType === "painel") {
      if (rep.scopeId === tenant?.panelVendasId) {
        title = "Painel CRM - Vendas";
        fileName = `relatorio_painel_vendas_${dateStr}.html`;
      } else if (rep.scopeId === tenant?.panelCampanhasId) {
        title = "Painel CRM - Campanhas";
        fileName = `relatorio_painel_campanhas_${dateStr}.html`;
      } else if (rep.scopeId === tenant?.panelPecasId) {
        title = "Painel CRM - Peças";
        fileName = `relatorio_painel_pecas_${dateStr}.html`;
      } else if (rep.scopeId === tenant?.panelOficinaId) {
        title = "Painel CRM - Oficina";
        fileName = `relatorio_painel_oficina_${dateStr}.html`;
      }
    } else if (rep.scopeType === "agente") {
      const s = await prisma.session.findFirst({
        where: { agentExternalId: rep.scopeId },
        select: { agentName: true },
      });
      const name = s?.agentName || rep.scopeId;
      const safe = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
      title = `Atendente - ${name}`;
      fileName = `relatorio_agente_${safe}_${dateStr}.html`;
    }

    const filePath = await exportReportHtml(rep as any, title, "./reports", fileName);
    console.log(`[OK] ${title} -> ${filePath}`);
  }

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
