import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { runJobASyncSessions } from "./jobs/job-a-sync-sessions.js";
import { runJobBSyncCards } from "./jobs/job-b-sync-cards.js";
import { calculateSynthetics } from "./jobs/job-c-synthetics.js";
import { runJobDStage1Analysis } from "./jobs/job-d-stage1-analysis.js";
import { runJobEStage2Reports } from "./jobs/job-e-stage2-report.js";
import { exportReportHtml } from "./report/html-reporter.js";
import { ensureTenant, panelConfigFromEnv } from "./domain/tenant.js";
import { PANEL_KEYS, resolvePanelIds, type PanelKey } from "./domain/panels.js";
import { lastClosedPeriod, periodContaining, type Period } from "./domain/period.js";
import { resolveScopeTitle } from "./domain/scope-title.js";
import { withAdvisoryLock } from "./domain/lock.js";
import { FlwClient } from "./flw/flw-client.js";

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

/**
 * Janela do relatório: `--week YYYY-MM-DD` (qualquer data dentro da semana-alvo)
 * ou, sem argumento, a última janela já encerrada. Sempre no fuso do tenant.
 */
async function resolveReportPeriod(tenantId: string, args: string[]): Promise<Period> {
  const tenant = await ensureTenant(tenantId);
  const week = argValue(args, "--week");
  if (week) {
    const ref = new Date(`${week}T12:00:00`);
    if (isNaN(ref.getTime())) throw new Error(`--week inválido: ${week} (use YYYY-MM-DD)`);
    return periodContaining(ref, tenant.timezone, tenant.periodWeekStart);
  }
  return lastClosedPeriod(new Date(), tenant.timezone, tenant.periodWeekStart);
}

/** Padrão: incremental por UpdatedAt. `--from YYYY-MM-DD` / `--days N` = backfill; `--all` = tudo; `--resume` retoma. */
function syncOptions(tenantId: string, args: string[]) {
  const days = argValue(args, "--days");
  return {
    tenantId,
    fromDate: argValue(args, "--from"),
    lookbackDays: days ? parseInt(days, 10) : undefined,
    all: args.includes("--all"),
    resume: args.includes("--resume"),
  };
}

async function publishPeriod(tenantId: string, args: string[], period: Period): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const correct = args.includes("--correct");
  const allowIncomplete = args.includes("--allow-incomplete");
  const reason = argValue(args, "--reason");

  console.log(`Janela: ${period.label} (${period.start.toISOString()} → ${period.end.toISOString()})`);

  const result = await runJobEStage2Reports({
    tenantId,
    startDate: period.start,
    endDate: period.end,
    dryRun,
    correct,
    reason,
    allowIncomplete,
  });

  // O scopeId do atendente é o userId da sessão (≠ do id de cadastro em `agents`): o nome vem das sessões.
  const [tenant, agents] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    prisma.session.findMany({
      where: { tenantId, agentExternalId: { not: null }, agentName: { not: null } },
      select: { agentExternalId: true, agentName: true },
      distinct: ["agentExternalId"],
    }),
  ]);
  const agentNames = new Map(agents.map((a) => [a.agentExternalId as string, a.agentName as string]));
  const day = period.label.split(" a ")[0];

  if (dryRun) {
    for (const d of result.drafts) {
      const { title, key } = resolveScopeTitle(d, tenant, agentNames);
      const draft = {
        id: "draft",
        tenantId,
        periodStart: period.start,
        periodEnd: period.end,
        publishedAt: new Date(),
        correctedAt: null,
        correctionReason: null,
        ...d,
      } as any;
      const file = await exportReportHtml(draft, `RASCUNHO — ${title}`, "./reports/rascunho", `rascunho_${d.scopeType}_${key}_${day}.html`);
      console.log(`Rascunho (não publicado): ${file}`);
    }
    return;
  }

  const reports = await prisma.periodReport.findMany({
    where: { tenantId, periodStart: period.start, periodEnd: period.end },
  });
  for (const rep of reports) {
    const { title, key } = resolveScopeTitle(rep, tenant, agentNames);
    const file = await exportReportHtml(rep, title, "./reports", `relatorio_${rep.scopeType}_${key}_${day}.html`);
    console.log(`Relatório HTML: ${file}`);
  }
}

async function run(command: string, args: string[]) {
  const tenantId = env.DEFAULT_TENANT_ID;

  switch (command) {
    case "sync": {
      console.log("=== SYNC (JOBS A & B) ===");
      await runJobASyncSessions(syncOptions(tenantId, args));
      await runJobBSyncCards(syncOptions(tenantId, args));
      console.log("=== SYNC FINALIZADO ===");
      break;
    }

    case "cards": {
      console.log("=== SINCRONIZAÇÃO DE CARDS CRM (JOB B) ===");
      await runJobBSyncCards(syncOptions(tenantId, args));
      console.log("=== SYNC DE CARDS FINALIZADO ===");
      break;
    }

    case "synthetics": {
      console.log("=== CÁLCULO DE MÉTRICAS SINTÉTICAS (JOB C) ===");
      const period = await resolveReportPeriod(tenantId, args);
      console.log(`Janela: ${period.label}`);
      const metrics = await calculateSynthetics({ tenantId, startDate: period.start, endDate: period.end });
      console.table(metrics);
      break;
    }

    case "stage1": {
      console.log("=== IA ESTÁGIO 1: ANÁLISE DE CONVERSAS FECHADAS (JOB D) ===");
      const limit = argValue(args, "--limit");
      await runJobDStage1Analysis({
        tenantId,
        limit: limit ? parseInt(limit, 10) : undefined,
        forceReanalyze: args.includes("--force"),
        sessionExternalId: argValue(args, "--session"),
        since: argValue(args, "--since"),
      });
      break;
    }

    case "daily": {
      console.log("=== ROTINA DIÁRIA: SYNC INCREMENTAL + IA ESTÁGIO 1 ===");
      await runJobASyncSessions({ tenantId });
      await runJobBSyncCards({ tenantId });
      await runJobDStage1Analysis({ tenantId });
      break;
    }

    case "config:lost-reasons": {
      // Só lê da FLW: não precisa do banco (usa IDs/títulos e o token do .env).
      console.log("=== MOTIVOS DE PERDA CADASTRADOS NOS PAINÉIS ===");
      const client = new FlwClient();
      const cfg = panelConfigFromEnv();
      const resolved: Record<PanelKey, string> = PANEL_KEYS.every((k) => cfg.ids[k])
        ? (cfg.ids as Record<PanelKey, string>)
        : resolvePanelIds(await client.listPanels(), cfg);
      const names: Record<PanelKey, string> = { vendas: "Vendas", campanhas: "Campanhas", pecas: "Peças", oficina: "Oficina" };
      for (const key of PANEL_KEYS) {
        const reasons = await client.listPanelLostReasons(resolved[key]);
        console.log(`\n${names[key]} (${resolved[key]}):`);
        if (reasons.length === 0) console.log("  (nenhum motivo cadastrado)");
        for (const r of reasons) console.log(`  - ${r.name}`);
      }
      console.log("\nCopie os nomes EXATOS para IGNORED_LOST_REASONS (fora do controle) e HYGIENE_LOST_REASONS (higienização).");
      break;
    }

    case "publish:weekly":
    case "report": {
      console.log("=== IA ESTÁGIO 2 & RELATÓRIOS DO PERÍODO (JOB E) ===");
      const period = await resolveReportPeriod(tenantId, args);
      await publishPeriod(tenantId, args, period);
      break;
    }

    case "pipeline": {
      console.log("=== INICIANDO PIPELINE COMPLETO FLW QUALITY ===");
      const period = await resolveReportPeriod(tenantId, args);
      console.log(`Janela: ${period.label}`);

      console.log("\n[Passo 1/4] Sincronizando FLW (Sessões e Cards, incremental)...");
      await runJobASyncSessions({ tenantId });
      await runJobBSyncCards({ tenantId });

      console.log("\n[Passo 2/4] Executando Análise de IA Estágio 1...");
      await runJobDStage1Analysis({ tenantId });

      console.log("\n[Passo 3/4] Agregando e Gerando Síntese Estágio 2...");
      console.log("\n[Passo 4/4] Exportando relatórios...");
      await publishPeriod(tenantId, args, period);

      console.log("\n=== PIPELINE CONCLUÍDO ===");
      break;
    }

    default: {
      console.log(`
Uso: pnpm <comando> [opções]

Comandos:
  job:sync        Sync incremental da FLW (Jobs A & B). 1ª carga: --from YYYY-MM-DD ou --all
                  [--from YYYY-MM-DD | --days N | --all | --resume]
  job:cards       Sync incremental apenas dos cards (Job B)                   [--from | --days | --all]
  job:synthetics  Métricas sintéticas da janela (Job C)                       [--week YYYY-MM-DD]
  job:stage1      Análise de IA por sessão (Job D)     [--limit N | --since YYYY-MM-DD | --session ID | --force]
  job:report      Publica os relatórios da janela (Job E)
  pipeline        Sync + IA + relatório da janela
  daily           Rotina diária: sync incremental + IA estágio 1 (agende de madrugada)
  publish:weekly  Publica a última janela encerrada (agende na quinta de manhã)
  config:lost-reasons  Lista os motivos de perda dos painéis para configurar o .env

Opções do report/pipeline:
  --week YYYY-MM-DD      Qualquer data dentro da semana-alvo (padrão: última janela encerrada)
  --dry-run              Não grava; gera rascunhos em ./reports/rascunho
  --allow-incomplete     Publica mesmo com a trava falhando (falhas vão para as limitações)
  --correct --reason "." Corrige relatório já publicado (guarda a versão anterior)
`);
      break;
    }
  }
}

const argv = process.argv.slice(2);
const command = argv[0] || "help";

// Só um job por vez (evita chamadas duplicadas à FLW e à OpenAI). A ajuda não precisa de banco.
(["help", "config:lost-reasons"].includes(command) || !argv.length ? run(command, argv) : withAdvisoryLock("flw-quality", () => run(command, argv)))
  .catch((err) => {
    console.error("Erro na execução do CLI:", err.message ?? err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
