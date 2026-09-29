import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/db/prisma";
import type { ReportItem, ScopeType, CriteriaScores, KpiMetrics, AiInsight, FunnelData } from "./types";

function parseHtmlReport(html: string, fileName: string): ReportItem {
  // Title
  const titleMatch = html.match(/<h1>([^<]+)<\/h1>/);
  const title = titleMatch ? titleMatch[1].trim() : fileName.replace(".html", "");

  // Scope & slug
  let scopeType: ScopeType = "geral";
  let scopeId = "geral";

  if (fileName.startsWith("relatorio_agente_")) {
    scopeType = "agente";
    scopeId = fileName.replace("relatorio_agente_", "").split("_")[0];
  } else if (fileName.startsWith("relatorio_painel_")) {
    scopeType = "painel";
    scopeId = fileName.replace("relatorio_painel_", "").split("_")[0];
  } else if (fileName.startsWith("relatorio_divisao_")) {
    scopeType = "divisao";
    scopeId = fileName.replace("relatorio_divisao_", "").split("_")[0];
  }

  const slug = fileName.replace(".html", "");

  // Period
  const periodMatch = html.match(/<strong>(\d{2}\/\d{2}\/\d{4})<\/strong>\s*até\s*<strong>(\d{2}\/\d{2}\/\d{4})<\/strong>/);
  const periodStart = periodMatch ? periodMatch[1] : "18/09/2026";
  const periodEnd = periodMatch ? periodMatch[2] : "25/09/2026";

  const preliminar = html.includes("preliminar-warning");

  // Nota Geral
  const scoreMatch = html.match(/<span class="ring-score">([0-9.]+)<\/span>/);
  const notaGeral = scoreMatch ? parseFloat(scoreMatch[1]) : 0;

  // Total Conversas
  const totalMatch = html.match(/Baseado em <strong>(\d+)<\/strong> conversas finalizadas/);
  const totalConversas = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  // KPIs
  const getKpiVal = (label: string): string => {
    const regex = new RegExp(`<div class="kpi-label">${label}<\\/div>\\s*<div class="kpi-value"[^>]*>([^<]+)<\\/div>`);
    const m = html.match(regex);
    return m ? m[1].trim() : "N/D";
  };

  const tmrMedioFormatado = getKpiVal("TMR Médio");
  const ftrMedianaFormatada = getKpiVal("FTR Mediana");
  const respClienteRaw = getKpiVal("Resp. Cliente").replace("%", "");
  const semRespostaRaw = getKpiVal("Sem Resposta").replace("%", "");
  const fechamentoRaw = getKpiVal("Fechamento CRM").replace("%", "");
  const reativacaoRaw = getKpiVal("Reativação").replace("%", "");

  const sinteticos: KpiMetrics = {
    n: totalConversas,
    tmrMedioFormatado,
    ftrMedianaFormatada,
    respClientePct: parseFloat(respClienteRaw) || 0,
    semRespostaPct: parseFloat(semRespostaRaw) || 0,
    taxaFechamentoPct: fechamentoRaw !== "N/D" ? parseFloat(fechamentoRaw) : null,
    reativacaoPct: parseFloat(reativacaoRaw) || 0,
  };

  // Criteria
  const getCritScore = (names: string | string[]): number | null => {
    const list = Array.isArray(names) ? names : [names];
    for (const name of list) {
      const regex = new RegExp(`<span class="criteria-name">${name}<\\/span>\\s*<span class="criteria-val">([0-9.]+)\\/10<\\/span>`);
      const m = html.match(regex);
      if (m) return parseFloat(m[1]);
    }
    return null;
  };

  const medias: CriteriaScores = {
    atrito: getCritScore(["Pouco ou Nenhum Atrito", "Pouco Atrito", "Atrito"]),
    solucao: getCritScore(["Apresentou Solução Clara", "Solução Clara", "Solução"]),
    necessidade: getCritScore(["Entendeu a Necessidade", "Necessidade"]),
    proximoPasso: getCritScore(["Próximo Passo Combinado", "Combinou Próximo Passo", "Próximo Passo"]),
    resolvida: getCritScore(["Conversa Resolvida no Diálogo", "Conversa Concluída/Resolvida", "Conversa Resolvida"]),
  };

  // Histogram
  const histograma = new Array(11).fill(0);
  const histoMatches = html.matchAll(/title="Nota (\d+): (\d+) conversas"/g);
  for (const m of histoMatches) {
    const idx = parseInt(m[1], 10);
    const count = parseInt(m[2], 10);
    if (idx >= 0 && idx <= 10) {
      histograma[idx] = count;
    }
  }

  // Pontos Fortes
  const textoFortes: AiInsight[] = [];
  const strongMatches = html.matchAll(/<li class="bullet-item strong">\s*<span class="badge-count">(\d+) casos?<\/span>\s*<div>([\s\S]*?)<\/div>\s*<\/li>/g);
  for (const sm of strongMatches) {
    textoFortes.push({
      n_casos: parseInt(sm[1], 10),
      texto: sm[2].replace(/<[^>]+>/g, "").trim(),
    });
  }

  // Oportunidades
  const textoOps: AiInsight[] = [];
  const oppMatches = html.matchAll(/<li class="bullet-item opp">\s*<span class="badge-count">(\d+) casos?<\/span>\s*<div>([\s\S]*?)<\/div>(?:\s*<div class="script-box"><strong>Script Sugerido:<\/strong>\s*"([^"]+)"<\/div>)?\s*<\/li>/g);
  for (const om of oppMatches) {
    let rawText = om[2].replace(/<[^>]+>/g, "").trim();
    let script = om[3] ? om[3].trim() : null;

    if (!script) {
      const inlineScriptMatch = rawText.match(/Script sugerido:\s*["“]([^"”]+)["”]/i);
      if (inlineScriptMatch) {
        script = inlineScriptMatch[1].trim();
        rawText = rawText.replace(/[\s\S]*?Script sugerido:[\s\S]*$/, "").trim();
      }
    }

    textoOps.push({
      n_casos: parseInt(om[1], 10),
      texto: rawText,
      script_sugerido: script,
    });
  }

  // Funil CRM (se presente)
  let funil: FunnelData | null = null;
  if (html.includes("Funil do Painel CRM")) {
    const wonM = html.match(/class="card-status-won">(\d+) Ganhos/);
    const lostM = html.match(/class="card-status-lost">(\d+) Perdidos/);
    const openM = html.match(/class="card-status-open">(\d+) Abertos/);

    const etapas: Record<string, number> = {};
    const etapaMatches = html.matchAll(/<span class="criteria-name">([^<]+)<\/span>\s*<span class="criteria-val">(\d+) cards<\/span>/g);
    for (const em of etapaMatches) {
      etapas[em[1].trim()] = parseInt(em[2], 10);
    }

    const lostReasons: Record<string, number> = {};
    const reasonMatches = html.matchAll(/<span class="criteria-name">([^<]+)<\/span>\s*<span class="criteria-val" style="color: var\(--danger\)">(\d+)<\/span>/g);
    for (const rm of reasonMatches) {
      lostReasons[rm[1].trim()] = parseInt(rm[2], 10);
    }

    funil = {
      open: openM ? parseInt(openM[1], 10) : 0,
      won: wonM ? parseInt(wonM[1], 10) : 0,
      lost: lostM ? parseInt(lostM[1], 10) : 0,
      etapas,
      lostReasons,
    };
  }

  return {
    id: slug,
    title,
    slug,
    scopeType,
    scopeId,
    periodStart,
    periodEnd,
    preliminar,
    notaGeral,
    totalConversas,
    medias,
    histograma,
    sinteticos,
    funil,
    textoFortes,
    textoOps,
  };
}

export async function loadAllReports(): Promise<ReportItem[]> {
  // 1. Tentar ler do banco Prisma se estiver online
  try {
    const dbReports = await prisma.periodReport.findMany({
      orderBy: { publishedAt: "desc" },
    });

    if (dbReports && dbReports.length > 0) {
      return dbReports.map((r) => {
        const s = r.sinteticos as any;
        const q = r.qualidade as any;
        return {
          id: r.id,
          title: `${r.scopeType.toUpperCase()} - ${r.scopeId}`,
          slug: `${r.scopeType}_${r.scopeId}`,
          scopeType: r.scopeType as ScopeType,
          scopeId: r.scopeId,
          periodStart: r.periodStart.toISOString().split("T")[0],
          periodEnd: r.periodEnd.toISOString().split("T")[0],
          preliminar: r.preliminar,
          limitacoes: r.limitacoes,
          notaGeral: q.notaGeral ?? 0,
          totalConversas: q.n ?? 0,
          medias: q.medias ?? {},
          histograma: q.histograma ?? new Array(11).fill(0),
          sinteticos: s,
          funil: r.funil as any,
          textoFortes: (r.textoFortes as any[]) || [],
          textoOps: (r.textoOps as any[]) || [],
        };
      });
    }
  } catch (err: any) {
    // Prisma offline, fallback seguro para arquivos de relatórios pré-gerados
  }

  // 2. Fallback: Ler arquivos HTML da pasta /reports
  const reportsDir = path.resolve(process.cwd(), "reports");
  try {
    const files = await fs.readdir(reportsDir);
    const htmlFiles = files.filter((f) => f.endsWith(".html"));

    const reports: ReportItem[] = [];
    for (const f of htmlFiles) {
      const content = await fs.readFile(path.join(reportsDir, f), "utf-8");
      reports.push(parseHtmlReport(content, f));
    }

    // Ordenar: Geral primeiro, Divisões, Painéis, e Atendentes por nota decrescente
    return reports.sort((a, b) => {
      const order: Record<ScopeType, number> = { geral: 1, divisao: 2, painel: 3, agente: 4 };
      if (order[a.scopeType] !== order[b.scopeType]) {
        return order[a.scopeType] - order[b.scopeType];
      }
      return b.notaGeral - a.notaGeral;
    });
  } catch (err) {
    console.error("Erro ao carregar pasta reports:", err);
    return [];
  }
}
