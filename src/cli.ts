import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { runJobASyncSessions } from "./jobs/job-a-sync-sessions.js";
import { runJobBSyncCards } from "./jobs/job-b-sync-cards.js";
import { calculateSynthetics } from "./jobs/job-c-synthetics.js";
import { runJobMetrics } from "./jobs/job-metrics.js";
import { runJobDStage1Analysis } from "./jobs/job-d-stage1-analysis.js";
import { runJobEStage2Reports } from "./jobs/job-e-stage2-report.js";
import { diaDeHoje, resumoDoEnvio, runJobFEmailResumos, type JobFOptions } from "./jobs/job-f-email-resumos.js";
import { criarRemetente, emailLigado, remetente, textoDoErro } from "./email/smtp.js";
import { exportReportHtml } from "./report/html-reporter.js";
import { ensureTenant, panelConfigFromEnv } from "./domain/tenant.js";
import { PANEL_KEYS, resolvePanelIds, type PanelKey } from "./domain/panels.js";
import { lastClosedMonth, lastClosedPeriod, monthKey, parseMonth, periodContaining, type Period } from "./domain/period.js";
import { resolveScopeTitle } from "./domain/scope-title.js";
import { TRAVA_JOBS, withAdvisoryLock } from "./domain/lock.js";
import { FlwClient } from "./flw/flw-client.js";
import { ensureAdmin } from "./auth/admin-cli.js";

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
}

/**
 * Janela do relatório: `--month AAAA-MM` (mês do calendário), `--week YYYY-MM-DD` (qualquer data dentro
 * da semana-alvo) ou, sem argumento, a última semana já encerrada. Sempre no fuso do tenant.
 */
async function resolveReportPeriod(tenantId: string, args: string[]): Promise<Period> {
  const tenant = await ensureTenant(tenantId);
  const month = argValue(args, "--month");
  if (month) return parseMonth(month, tenant.timezone);
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

/**
 * O envio dos resumos por e-mail, depois de um comando que rodou com `--email`. O que o comando já fez (sync, IA,
 * publicação) fica: um problema aqui aparece no terminal e o comando termina com código 1, para o cron acusar.
 */
async function enviarResumos(opcoes: JobFOptions): Promise<void> {
  console.log("\nResumos por e-mail...");
  try {
    const envio = await runJobFEmailResumos(opcoes);
    if (envio.desligado) {
      console.error("Envio de e-mail desligado: configure SMTP_HOST");
      process.exitCode = 1;
      return;
    }
    for (const l of resumoDoEnvio(envio)) console.log(l);
    if (envio.erros.length) process.exitCode = 1;
  } catch (err) {
    // Os relatórios já estão publicados: o erro do envio aparece, mas não desfaz nada. `pnpm email:resumos` repete só o que falhou.
    console.error(`Erro no envio dos e-mails: ${textoDoErro(err)}`);
    process.exitCode = 1;
  }
}

async function publishPeriod(tenantId: string, args: string[], period: Period): Promise<void> {
  const dryRun = args.includes("--dry-run");
  const correct = args.includes("--correct");
  const allowIncomplete = args.includes("--allow-incomplete");
  const reason = argValue(args, "--reason");

  console.log(`Janela: ${period.label} (${period.start.toISOString()} → ${period.end.toISOString()})`);

  const isMonth = period.granularity === "mes";
  const result = await runJobEStage2Reports({
    tenantId,
    startDate: period.start,
    endDate: period.end,
    granularity: isMonth ? "mes" : "semana",
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
  // Nome do arquivo: o 1º dia da semana ("2026-09-23") ou o mês ("2026-09").
  const day = isMonth ? monthKey(period, tenant?.timezone) : period.label.split(" a ")[0];

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

  // Resumo por e-mail: só com `--email` e só quando publicou de verdade. A correção de um relatório já publicado não reenvia.
  if (correct) return;
  if (!args.includes("--email")) {
    console.log("\nResumos por e-mail não enviados (use --email para enviar).");
    return;
  }
  await enviarResumos({ tenantId, granularity: isMonth ? "mes" : "semana", periodStart: period.start });
}

/**
 * `--day AAAA-MM-DD` (o dia, calculado na hora), `--week YYYY-MM-DD` ou `--month AAAA-MM` de um relatório já publicado
 * (sem a opção, a última semana encerrada).
 */
async function resolveEmailPeriod(tenantId: string, args: string[]) {
  const dia = argValue(args, "--day");
  if (dia) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error(`--day inválido: ${dia} (use AAAA-MM-DD)`);
    return { granularity: "dia" as const, dia, label: `dia ${dia}` };
  }
  const period = await resolveReportPeriod(tenantId, args);
  return { granularity: period.granularity === "mes" ? ("mes" as const) : ("semana" as const), periodStart: period.start, label: period.label };
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

    case "metrics": {
      console.log("=== INDICADORES POR CONVERSA (TMR, SEM RESPOSTA, REATIVAÇÃO, FTR) ===");
      await runJobMetrics({ tenantId, all: args.includes("--all") });
      break;
    }

    case "synthetics": {
      console.log("=== CÁLCULO DE MÉTRICAS SINTÉTICAS (JOB C) ===");
      await runJobMetrics({ tenantId });
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
      // Com `--email`, o resumo de hoje (até a hora do sync) vai para quem marcou "Diário". Sem a flag, nada é enviado.
      if (args.includes("--email")) {
        const tenant = await ensureTenant(tenantId);
        await enviarResumos({ tenantId, granularity: "dia", dia: diaDeHoje(tenant.timezone) });
      }
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

    case "user:admin": {
      // Só mexe na tabela de usuários: não precisa da FLW.
      const email = argValue(args, "--email");
      if (!email) throw new Error('Uso: pnpm user:admin -- --email ana@empresa.com.br --nome "Ana" [--senha <senha definitiva>]');
      const r = await ensureAdmin({ email, nome: argValue(args, "--nome"), senha: argValue(args, "--senha") });
      console.log(`${r.criado ? "Administrador criado" : "Administrador atualizado (perfil, acesso e senha)"}: ${r.nome} <${r.email}>`);
      if (r.senhaProvisoria) {
        console.log(`Senha provisória: ${r.senhaProvisoria}`);
        console.log("Mostrada só agora. No primeiro acesso a pessoa cria a própria senha.");
      } else {
        console.log("Senha definitiva gravada (sem troca obrigatória).");
      }
      break;
    }

    case "publish:monthly": {
      console.log("=== IA ESTÁGIO 2 & RELATÓRIOS DO ÚLTIMO MÊS ENCERRADO (JOB E) ===");
      const tenant = await ensureTenant(tenantId);
      await publishPeriod(tenantId, args, lastClosedMonth(new Date(), tenant.timezone));
      break;
    }

    case "publish:weekly":
    case "report": {
      console.log("=== IA ESTÁGIO 2 & RELATÓRIOS DO PERÍODO (JOB E) ===");
      const period = await resolveReportPeriod(tenantId, args);
      await publishPeriod(tenantId, args, period);
      break;
    }

    case "email:teste": {
      // Só fala com o servidor de e-mail: não precisa do banco nem da FLW.
      const para = argValue(args, "--para");
      if (!para) throw new Error("Uso: pnpm email:teste -- --para fulano@empresa.com.br");
      console.log("=== TESTE DO ENVIO DE E-MAIL ===");
      if (!emailLigado()) throw new Error("Envio de e-mail desligado: configure SMTP_HOST (e SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM).");
      console.log(`Servidor: ${env.SMTP_HOST}:${env.SMTP_PORT}${env.SMTP_SECURE ? " (TLS)" : ""} · remetente: ${remetente() || "(não configurado)"}`);
      const r = criarRemetente();
      try {
        await r.enviar({
          to: para,
          subject: "Teste do envio de e-mail do painel",
          html: "<p>O envio de e-mail do painel está funcionando.</p>",
          text: "O envio de e-mail do painel está funcionando.",
        });
        console.log(`Enviado para ${para}. Confira a caixa de entrada e o spam.`);
      } catch (err) {
        throw new Error(`O servidor de e-mail recusou o envio: ${textoDoErro(err)}`);
      } finally {
        r.fechar();
      }
      break;
    }

    case "email:resumos": {
      const dryRun = args.includes("--dry-run");
      console.log("=== RESUMOS POR E-MAIL ===");
      const alvo = await resolveEmailPeriod(tenantId, args);
      console.log(`Janela: ${alvo.label}`);
      const envio = await runJobFEmailResumos({
        tenantId,
        granularity: alvo.granularity,
        periodStart: "periodStart" in alvo ? alvo.periodStart : undefined,
        dia: "dia" in alvo ? alvo.dia : undefined,
        dryRun,
        para: argValue(args, "--para"),
        reenviar: args.includes("--reenviar"),
      });
      if (envio.desligado) throw new Error("Envio de e-mail desligado: configure SMTP_HOST. Para só ver os e-mails, use --dry-run.");
      for (const l of resumoDoEnvio(envio, dryRun)) console.log(l);
      if (envio.erros.length) process.exitCode = 1;
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
  job:metrics     Recalcula os indicadores gravados em cada conversa (1ª vez: backfill)  [--all]
  job:synthetics  Métricas sintéticas da janela (Job C)                       [--week YYYY-MM-DD]
  job:stage1      Análise de IA por sessão (Job D)     [--limit N | --since YYYY-MM-DD | --session ID | --force]
  job:report      Publica os relatórios da janela (Job E)
  pipeline        Sync + IA + relatório da janela                                [--email]
  daily           Rotina diária: sync incremental + IA estágio 1 (agende de madrugada)
                  Com --email, manda também o resumo de hoje para quem marcou "Diário" (agende no fim da tarde)
                  pnpm daily -- --email
  publish:weekly  Publica a última janela encerrada (agende na quinta de manhã)  [--email]
  publish:monthly Publica o último mês encerrado (agende no dia 2 de cada mês, depois do daily)  [--email]
  email:resumos   Envia (ou reenvia) os resumos por e-mail de um dia, de uma semana ou de um mês
                  pnpm email:resumos -- --day AAAA-MM-DD | --week YYYY-MM-DD | --month AAAA-MM [--dry-run] [--para fulano@...] [--reenviar]
  email:teste     Manda um e-mail simples para conferir o servidor de e-mail
                  pnpm email:teste -- --para fulano@empresa.com.br
  config:lost-reasons  Lista os motivos de perda dos painéis para configurar o .env
  user:admin      Cria (ou promove) um administrador do painel e imprime a senha provisória
                  pnpm user:admin -- --email ana@empresa.com.br --nome "Ana" [--senha <definitiva>]

Opções do report/pipeline:
  --week YYYY-MM-DD      Qualquer data dentro da semana-alvo (padrão: última janela encerrada)
  --month AAAA-MM        Mês do calendário (no report/pipeline; o publish:monthly já usa o último mês encerrado)
  --email                Manda os resumos por e-mail (daily, publish:weekly, publish:monthly e pipeline). Sem a flag, nada é enviado
  --dry-run              Não grava; gera rascunhos em ./reports/rascunho
  --allow-incomplete     Publica mesmo com a trava falhando (falhas vão para as limitações)
  --correct --reason "." Corrige relatório já publicado (guarda a versão anterior)

Disparo por HTTP (daily, publish:weekly e publish:monthly), com JOBS_TOKEN no cabeçalho "Authorization: Bearer":
  GET /api/jobs/daily?email = pnpm daily -- --email; o mesmo em /api/jobs/weekly e /api/jobs/monthly (docs/COMANDOS.md, §8)
`);
      break;
    }
  }
}

const argv = process.argv.slice(2);
const command = argv[0] || "help";

// Só um job por vez (evita chamadas duplicadas à FLW e à OpenAI). A ajuda não precisa de banco.
(["help", "config:lost-reasons", "user:admin", "email:teste"].includes(command) || !argv.length ? run(command, argv) : withAdvisoryLock(TRAVA_JOBS, () => run(command, argv)))
  .catch((err) => {
    console.error("Erro na execução do CLI:", err.message ?? err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
