import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DateTime } from "luxon";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { chaveEscopo, listSubscribableScopes, rotuloEscopo } from "../domain/report-scopes";
import { parseTeamGroups, type TeamGroup } from "../domain/teams";
import { FREQUENCIAS, blocoEntra, type Frequencia } from "../email/frequencias";
import { montarEmailResumo, type BlocoEmail, type PeriodoEmail } from "../email/resumo-email";
import { emailLigado, criarRemetente, textoDoErro, type Enviar } from "../email/smtp.js";
import { fmtNomeMes } from "../lib/format";
import { loadLiveReports, resolveFreePeriod } from "../lib/live-loader";
import { toReportItems } from "../lib/reports-loader";
import { loadAuditedSessions } from "../lib/sessions-loader";
import type { ReportItem } from "../lib/types";

export interface JobFOptions {
  tenantId: string;
  granularity: Frequencia;
  /** Semana e mês: início da janela publicada (o `period_start` dos relatórios). */
  periodStart?: Date;
  /** Dia: "AAAA-MM-DD" no fuso do tenant. Calculado na hora, como o período livre do painel, sem publicar nada. */
  dia?: string;
  /** Troca o "agora" (testes). */
  agora?: Date;
  /** Grava os e-mails como HTML em `reports/emails/<período>/` e não envia nem registra nada. */
  dryRun?: boolean;
  /** Manda só para esta pessoa (e-mail do login). */
  para?: string;
  /** Manda de novo para quem já recebeu. */
  reenviar?: boolean;
  /** Troca o envio (testes). */
  enviar?: Enviar;
  /** Troca a pasta do `--dry-run` (testes). */
  pastaDryRun?: string;
}

export interface ResultadoJobF {
  /** Envio desligado (sem SMTP_HOST): nada foi feito. */
  desligado: boolean;
  enviados: number;
  semNada: number;
  jaEnviados: number;
  erros: Array<{ email: string; motivo: string }>;
  /** `--dry-run`: os arquivos gravados. */
  arquivos: string[];
  avisos: string[];
}

const vazio = (): ResultadoJobF => ({ desligado: false, enviados: 0, semNada: 0, jaEnviados: 0, erros: [], arquivos: [], avisos: [] });

const nomeArquivo = (email: string) => email.replace(/[^a-z0-9@._+-]/gi, "_");

/** "2026-10-06": o dia de hoje no fuso do tenant. */
export const diaDeHoje = (tz: string, agora: Date = new Date()) => DateTime.fromJSDate(agora, { zone: tz }).toFormat("yyyy-MM-dd");

export async function runJobFEmailResumos(options: JobFOptions): Promise<ResultadoJobF> {
  const { tenantId, granularity, dryRun = false } = options;
  const agora = options.agora ?? new Date();
  const resultado = vazio();
  if (granularity === "dia" && !options.dia) throw new Error("Informe o dia (AAAA-MM-DD).");
  if (granularity !== "dia" && !options.periodStart) throw new Error("Informe o início do período publicado.");

  // Sem SMTP o `--dry-run` ainda funciona: ele só grava arquivos.
  if (!dryRun && !options.enviar && !emailLigado()) {
    resultado.desligado = true;
    return resultado;
  }
  const appUrl = (env.APP_URL.trim() || (dryRun ? "http://localhost:3000" : "")).replace(/\/+$/, "");
  if (!appUrl) throw new Error("Configure APP_URL com o endereço público do painel (por exemplo https://qualidade.tterrasul.com.br): é ele que o botão do e-mail abre.");
  // Sem o https:// o botão do e-mail abriria um endereço quebrado, e ninguém veria o erro.
  if (!/^https?:\/\//i.test(appUrl)) throw new Error("O APP_URL precisa começar com https:// (por exemplo https://qualidade.tterrasul.com.br).");

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });

  // De onde vêm os relatórios: os publicados (semana e mês) ou o cálculo de hoje (dia).
  let periodStart: Date;
  let janela: { start: Date; end: Date };
  let periodo: PeriodoEmail;
  let relatorios: ReportItem[];
  if (granularity === "dia") {
    const dia = options.dia as string;
    const resolvido = await resolveFreePeriod(dia, dia, agora);
    if (!resolvido) throw new Error("O painel ainda não tem empresa cadastrada: nenhum resumo do dia para calcular.");
    const { period, includesToday } = resolvido.free;
    periodStart = period.start;
    janela = { start: period.start, end: period.end };
    relatorios = await loadLiveReports(dia, dia, agora, { semAtendentes: true });
    // Só o dia de hoje leva o "até": a hora do último sync, a mesma do "Atualizado…" do painel.
    const ate = includesToday ? (relatorios[0]?.dadosAte ?? agora.toISOString()) : undefined;
    periodo = { granularity, start: period.start.toISOString(), end: period.end.toISOString(), ate };
  } else {
    periodStart = options.periodStart as Date;
    const rows = await prisma.periodReport.findMany({ where: { tenantId, granularity, periodStart, scopeType: { not: "agente" } } });
    if (rows.length === 0) throw new Error(`Não há relatório ${granularity === "mes" ? "mensal" : "semanal"} publicado para ${periodStart.toISOString()}.`);
    janela = { start: rows[0].periodStart, end: rows[0].periodEnd };
    periodo = { granularity, start: rows[0].periodStart.toISOString(), end: rows[0].periodEnd.toISOString() };
    relatorios = await toReportItems(rows);
  }
  const porEscopo = new Map(relatorios.map((r) => [chaveEscopo(r), r]));

  // Escopos que existem hoje, na ordem do menu: define a ordem dos blocos e o que está "sem grupo".
  let grupos: TeamGroup[] = [];
  try {
    grupos = parseTeamGroups(tenant?.teamGroups);
  } catch {
    /* configuração de equipes inválida: só as equipes ficam de fora da conferência */
  }
  const ordem = new Map(listSubscribableScopes(tenant, grupos).map((e, i) => [chaveEscopo(e), i]));

  // Só quem tem a caixa daquela frequência marcada.
  const campo = (FREQUENCIAS.find((f) => f.granularity === granularity) as (typeof FREQUENCIAS)[number]).campo;
  const usuarios = await prisma.user.findMany({
    where: {
      deactivatedAt: null,
      [campo]: true,
      subscriptions: { some: {} },
      ...(options.para ? { email: options.para.trim().toLowerCase() } : {}),
    },
    include: { subscriptions: true },
    orderBy: { email: "asc" },
  });
  if (options.para && usuarios.length === 0) {
    const rotulo = (FREQUENCIAS.find((f) => f.granularity === granularity) as (typeof FREQUENCIAS)[number]).rotulo.toLowerCase();
    throw new Error(
      `Nenhum usuário ativo com o resumo ${rotulo} marcado para ${options.para}. Confira o e-mail e a seção "Resumos por e-mail" em /usuarios.`,
    );
  }

  // Assinaturas de escopos que já não existem (grupo renomeado ou removido): o administrador precisa remarcar.
  const sumidos = new Set<string>();
  for (const u of usuarios) for (const s of u.subscriptions) if (!ordem.has(chaveEscopo(s))) sumidos.add(rotuloEscopo(s.scopeType, s.scopeId, tenant));
  for (const rotulo of sumidos) resultado.avisos.push(`${rotulo} não existe mais na configuração: quem acompanhava precisa remarcar em /usuarios.`);

  const jaEnviados = dryRun
    ? new Set<string>()
    : new Set(
        (await prisma.summaryEmail.findMany({ where: { granularity, periodStart, status: "enviado" }, select: { userId: true } })).map((e) => e.userId),
      );

  // A contagem "abaixo da meta" é a mesma da tela (`loadAuditedSessions`); cada escopo é contado uma vez.
  const abaixoDe = new Map<string, number>();
  const abaixo = async (r: ReportItem) => {
    const chave = chaveEscopo(r);
    if (!abaixoDe.has(chave)) {
      const page = await loadAuditedSessions({
        start: janela.start,
        end: janela.end,
        scopeType: r.scopeType,
        scopeId: r.scopeId,
        limit: 1,
      });
      abaixoDe.set(chave, page.contagens.abaixo);
    }
    return abaixoDe.get(chave) as number;
  };

  const remetente = dryRun || options.enviar ? null : criarRemetente();
  const enviar: Enviar | null = options.enviar ?? remetente?.enviar ?? null;
  // Pasta do período: "2026-09" no mensal, o 1º dia ("2026-09-23") no semanal, como os relatórios em HTML.
  // O dia leva "dia-" na frente para não cair na pasta de uma semana que começa na mesma data.
  const dataLocal = DateTime.fromJSDate(periodStart, { zone: tenant?.timezone ?? "America/Sao_Paulo" });
  const pasta = path.resolve(
    options.pastaDryRun ?? "./reports/emails",
    granularity === "dia" ? `dia-${dataLocal.toFormat("yyyy-MM-dd")}` : dataLocal.toFormat(granularity === "mes" ? "yyyy-MM" : "yyyy-MM-dd"),
  );

  try {
    for (const u of usuarios) {
      if (jaEnviados.has(u.id) && !options.reenviar) {
        resultado.jaEnviados++;
        continue;
      }

      let escopos: Array<{ scopeType: string; scopeId: string; reportId: string }> = [];
      let enviado = false;
      // O erro de uma pessoa (banco, montagem ou envio) não para a rodada: as outras seguem.
      try {
        const itens = u.subscriptions
          .map((s) => porEscopo.get(chaveEscopo(s)))
          .filter((r): r is ReportItem => !!r && blocoEntra(r, granularity))
          .sort((a, b) => (ordem.get(chaveEscopo(a)) ?? 999) - (ordem.get(chaveEscopo(b)) ?? 999));
        if (itens.length === 0) {
          resultado.semNada++;
          continue;
        }

        const blocos: BlocoEmail[] = [];
        for (const r of itens) {
          blocos.push({
            scopeType: r.scopeType,
            scopeId: r.scopeId,
            rotulo: rotuloEscopo(r.scopeType, r.scopeId, tenant),
            notaGeral: r.notaGeral,
            delta: r.comparativo?.deltaNota ?? null,
            mesAnterior: granularity === "mes" && r.comparativo ? fmtNomeMes(r.comparativo.periodoAnterior.start) : undefined,
            medias: r.medias,
            abaixo: await abaixo(r),
            preliminar: r.preliminar,
          });
        }
        const email = montarEmailResumo({ pessoa: { nome: u.name }, periodo, blocos, appUrl });

        if (dryRun) {
          await mkdir(pasta, { recursive: true });
          const arquivo = path.join(pasta, `${nomeArquivo(u.email)}.html`);
          await writeFile(arquivo, email.html, "utf-8");
          resultado.arquivos.push(arquivo);
          resultado.enviados++;
          continue;
        }

        escopos = itens.map((r) => ({ scopeType: r.scopeType, scopeId: r.scopeId, reportId: r.id }));
        await (enviar as Enviar)({ to: u.email, subject: email.assunto, html: email.html, text: email.texto });
        enviado = true;
        await registrar(u.id, granularity, periodStart, u.email, escopos, { status: "enviado", error: null, sentAt: new Date() });
        resultado.enviados++;
      } catch (err) {
        const motivo = textoDoErro(err);
        if (enviado) {
          // O e-mail saiu e só o registro falhou: conta como enviado, mas a próxima rodada não sabe disso.
          resultado.enviados++;
          resultado.avisos.push(`Enviado para ${u.email}, mas o registro falhou: a próxima rodada pode mandar de novo para essa pessoa. (${motivo})`);
        } else {
          resultado.erros.push({ email: u.email, motivo });
          if (!dryRun) await registrar(u.id, granularity, periodStart, u.email, escopos, { status: "erro", error: motivo, sentAt: null }).catch(() => {});
        }
      }
    }
  } finally {
    remetente?.fechar();
  }

  return resultado;
}

async function registrar(
  userId: string,
  granularity: string,
  periodStart: Date,
  toAddress: string,
  escopos: Array<{ scopeType: string; scopeId: string; reportId: string }>,
  estado: { status: "enviado" | "erro"; error: string | null; sentAt: Date | null },
) {
  const dados = { toAddress, scopes: escopos, ...estado };
  await prisma.summaryEmail.upsert({
    where: { userId_granularity_periodStart: { userId, granularity, periodStart } },
    create: { userId, granularity, periodStart, ...dados },
    update: dados,
  });
}

/** As linhas do terminal depois de uma rodada. */
export function resumoDoEnvio(r: ResultadoJobF, dryRun = false): string[] {
  const linhas: string[] = [];
  for (const a of r.avisos) linhas.push(`Aviso: ${a}`);
  for (const f of r.arquivos) linhas.push(`E-mail (não enviado): ${f}`);
  for (const e of r.erros) linhas.push(`Erro: ${e.email}: ${e.motivo}`);
  linhas.push(
    `${dryRun ? "Gerados (sem enviar)" : "Enviados"}: ${r.enviados} · Sem nada para mandar: ${r.semNada} · Erros: ${r.erros.length}` +
      (r.jaEnviados ? ` · Já enviados antes: ${r.jaEnviados} (use --reenviar para mandar de novo)` : ""),
  );
  return linhas;
}
