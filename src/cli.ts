import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { runJobASyncSessions } from "./jobs/job-a-sync-sessions.js";
import { runJobBSyncCards } from "./jobs/job-b-sync-cards.js";
import { calculateSynthetics } from "./jobs/job-c-synthetics.js";
import { runJobDStage1Analysis } from "./jobs/job-d-stage1-analysis.js";
import { runJobEStage2Reports } from "./jobs/job-e-stage2-report.js";
import { exportReportHtml } from "./report/html-reporter.js";

async function resolveReportMetadata(
  tenantId: string,
  rep: any
): Promise<{ title: string; fileName: string }> {
  const dateStr = rep.periodStart.toISOString().split("T")[0];
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  if (rep.scopeType === "geral") {
    return {
      title: "Visão Geral da Operação",
      fileName: `relatorio_geral_operacao_${dateStr}.html`,
    };
  }

  if (rep.scopeType === "divisao") {
    if (rep.scopeId === "carros") {
      return {
        title: "Divisão Veículos (Vendas & Campanhas)",
        fileName: `relatorio_divisao_veiculos_${dateStr}.html`,
      };
    }
    if (rep.scopeId === "pecas") {
      return {
        title: "Divisão Pós-Venda (Peças & Oficina)",
        fileName: `relatorio_divisao_posvenda_${dateStr}.html`,
      };
    }
    return {
      title: `Divisão ${rep.scopeId.toUpperCase()}`,
      fileName: `relatorio_divisao_${rep.scopeId}_${dateStr}.html`,
    };
  }

  if (rep.scopeType === "painel") {
    let name = "Painel CRM";
    let key = rep.scopeId;
    if (rep.scopeId === tenant?.panelVendasId) {
      name = "Painel CRM - Vendas";
      key = "vendas";
    } else if (rep.scopeId === tenant?.panelCampanhasId) {
      name = "Painel CRM - Campanhas";
      key = "campanhas";
    } else if (rep.scopeId === tenant?.panelPecasId) {
      name = "Painel CRM - Peças";
      key = "pecas";
    } else if (rep.scopeId === tenant?.panelOficinaId) {
      name = "Painel CRM - Oficina";
      key = "oficina";
    }
    return {
      title: name,
      fileName: `relatorio_painel_${key}_${dateStr}.html`,
    };
  }

  if (rep.scopeType === "agente") {
    const session = await prisma.session.findFirst({
      where: { agentExternalId: rep.scopeId },
      select: { agentName: true },
    });
    const agentName = session?.agentName || rep.scopeId;
    const safeName = agentName.toLowerCase().replace(/[^a-z0-9]/g, "_");
    return {
      title: `Atendente - ${agentName}`,
      fileName: `relatorio_agente_${safeName}_${dateStr}.html`,
    };
  }

  return {
    title: `${rep.scopeType.toUpperCase()} - ${rep.scopeId}`,
    fileName: `relatorio_${rep.scopeType}_${rep.scopeId}_${dateStr}.html`,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  const tenantId = env.DEFAULT_TENANT_ID;

  switch (command) {
    case "sync": {
      console.log("=== EXECUTANDO SYNC COMPLETO (JOBS A & B) ===");
      const daysArgIdx = args.indexOf("--days");
      const isAll = args.includes("--all");
      const days = isAll ? undefined : (daysArgIdx !== -1 ? parseInt(args[daysArgIdx + 1], 10) : 7);
      if (days) {
        console.log(`Buscando sessões e cards dos últimos ${days} dias... (use --days N ou --all para histórico completo)`);
      } else {
        console.log("Buscando histórico completo de sessões e cards...");
      }
      await runJobASyncSessions({ tenantId, lookbackDays: days });
      await runJobBSyncCards({ tenantId, lookbackDays: days });
      console.log("=== SYNC FINALIZADO ===");
      break;
    }

    case "cards": {
      console.log("=== SINCRONIZAÇÃO DE CARDS CRM (JOB B) ===");
      const daysArgIdx = args.indexOf("--days");
      const isAll = args.includes("--all");
      const days = isAll ? undefined : (daysArgIdx !== -1 ? parseInt(args[daysArgIdx + 1], 10) : 7);
      if (days) {
        console.log(`Buscando cards dos últimos ${days} dias...`);
      } else {
        console.log("Buscando histórico completo de cards...");
      }
      await runJobBSyncCards({ tenantId, lookbackDays: days });
      console.log("=== SYNC DE CARDS FINALIZADO ===");
      break;
    }

    case "synthetics": {
      console.log("=== CÁLCULO DE MÉTRICAS SINTÉTICAS (JOB C) ===");
      const daysArgIdx = args.indexOf("--days");
      const days = daysArgIdx !== -1 ? parseInt(args[daysArgIdx + 1], 10) : 7;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      console.log(`Calculando para os últimos ${days} dias (${startDate.toISOString().split("T")[0]} a ${endDate.toISOString().split("T")[0]})...`);
      const metrics = await calculateSynthetics({
        tenantId,
        startDate,
        endDate,
      });
      console.table(metrics);
      break;
    }

    case "stage1": {
      console.log("=== IA ESTÁGIO 1: ANÁLISE DE CONVERSAS FECHADAS (JOB D) ===");
      const limitArgIdx = args.indexOf("--limit");
      const limit = limitArgIdx !== -1 ? parseInt(args[limitArgIdx + 1], 10) : undefined;
      await runJobDStage1Analysis({ tenantId, limit });
      break;
    }

    case "report": {
      console.log("=== IA ESTÁGIO 2 & RELATÓRIOS DO PERÍODO (JOB E) ===");
      const daysArgIdx = args.indexOf("--days");
      const days = daysArgIdx !== -1 ? parseInt(args[daysArgIdx + 1], 10) : 7;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      console.log(`Gerando relatórios para os últimos ${days} dias...`);
      await runJobEStage2Reports({
        tenantId,
        startDate,
        endDate,
      });

      // Exportar HTMLs
      const reports = await prisma.periodReport.findMany({
        where: { tenantId, periodStart: startDate, periodEnd: endDate },
      });

      for (const rep of reports) {
        const { title, fileName } = await resolveReportMetadata(tenantId, rep);
        const filePath = await exportReportHtml(rep, title, "./reports", fileName);
        console.log(`Relatório HTML gerado em: ${filePath}`);
      }
      break;
    }

    case "pipeline": {
      console.log("=== INICIANDO PIPELINE COMPLETO FLW QUALITY ===");
      const daysArgIdx = args.indexOf("--days");
      const days = daysArgIdx !== -1 ? parseInt(args[daysArgIdx + 1], 10) : 7;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      console.log(`Janela: ${startDate.toISOString().split("T")[0]} até ${endDate.toISOString().split("T")[0]} (${days} dias)`);

      // 1. Sync A & B
      console.log("\n[Passo 1/4] Sincronizando FLW (Sessões e Cards)...");
      await runJobASyncSessions({
        tenantId,
        fromDate: startDate.toISOString(),
        toDate: endDate.toISOString(),
      });
      await runJobBSyncCards({
        tenantId,
        fromDate: startDate.toISOString(),
        toDate: endDate.toISOString(),
      });

      // 2. IA Estágio 1
      console.log("\n[Passo 2/4] Executando Análise de IA Estágio 1...");
      await runJobDStage1Analysis({ tenantId });

      // 3. IA Estágio 2 e Relatórios
      console.log("\n[Passo 3/4] Agregando e Gerando Síntese Estágio 2...");
      await runJobEStage2Reports({ tenantId, startDate, endDate });

      // 4. Exportação Visual HTML
      console.log("\n[Passo 4/4] Exportando Relatórios no Padrão Pry...");
      const reports = await prisma.periodReport.findMany({
        where: { tenantId, periodStart: startDate, periodEnd: endDate },
      });

      for (const rep of reports) {
        const { title, fileName } = await resolveReportMetadata(tenantId, rep);
        const filePath = await exportReportHtml(rep, title, "./reports", fileName);
        console.log(`📄 Relatório disponível: ${filePath}`);
      }

      console.log("\n=== PIPELINE CONCLUÍDO COM SUCESSO! ===");
      break;
    }

    default: {
      console.log(`
Uso: npm run <comando>

Comandos disponíveis:
  npm run job:sync        Sincroniza sessões, mensagens e painéis CRM da FLW (Jobs A & B)
  npm run job:cards       Sincroniza apenas cards de painéis CRM (Job B)
  npm run job:synthetics  Calcula e exibe métricas sintéticas (Job C)
  npm run job:stage1      Executa análise de qualidade IA com Structured Outputs (Job D)
  npm run job:report      Gera relatórios agregados e síntese gerencial de IA (Job E)
  npm run pipeline        Executa todo o fluxo de ponta a ponta e gera HTMLs no padrão Pry
`);
      break;
    }
  }
}

main()
  .catch((err) => {
    console.error("Erro na execução do CLI:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
