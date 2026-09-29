import fs from "node:fs/promises";
import path from "node:path";
import type { PeriodReport } from "../generated/client/index.js";

export function generateReportHtml(report: PeriodReport, scopeTitle: string): string {
  const sinteticos = report.sinteticos as any;
  const qualidade = report.qualidade as any;
  const funil = report.funil as any;
  const textoFortes = (report.textoFortes as any[]) || [];
  const textoOps = (report.textoOps as any[]) || [];

  const nota = qualidade.notaGeral ?? 0;
  const n = qualidade.n ?? 0;
  const medias = qualidade.medias ?? {};
  const histograma: number[] = qualidade.histograma || new Array(11).fill(0);
  const maxHisto = Math.max(...histograma, 1);

  // Formatar datas do período
  const startStr = new Date(report.periodStart).toLocaleDateString("pt-BR");
  const endStr = new Date(report.periodEnd).toLocaleDateString("pt-BR");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relatório de Qualidade — ${scopeTitle}</title>
  <style>
    :root {
      --bg-color: #f8fafc;
      --card-bg: #ffffff;
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --border-color: #e2e8f0;
      --success: #16a34a;
      --warning: #f59e0b;
      --danger: #dc2626;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-color);
      color: var(--text-main);
      font-family: var(--font-sans);
      padding: 32px 16px;
      line-height: 1.5;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    header { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid var(--border-color); padding-bottom: 16px; }
    h1 { font-size: 26px; font-weight: 700; color: var(--text-main); }
    .period-badge { font-size: 14px; color: var(--text-muted); }
    .preliminar-warning {
      background-color: #fef3c7;
      color: #92400e;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 20px;
      border: 1px solid #fde68a;
    }
    /* KPI Strip */
    .kpi-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: var(--card-bg);
      padding: 16px;
      border-radius: 12px;
      border: 1px solid var(--border-color);
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .kpi-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 600; }
    .kpi-value { font-size: 24px; font-weight: 700; color: var(--text-main); margin-top: 4px; }
    .kpi-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

    /* Main Grid */
    .main-grid {
      display: grid;
      grid-template-columns: 340px 1fr;
      gap: 24px;
      margin-bottom: 24px;
    }
    @media (max-width: 860px) {
      .main-grid { grid-template-columns: 1fr; }
    }
    .card {
      background: var(--card-bg);
      border-radius: 12px;
      border: 1px solid var(--border-color);
      padding: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .card-title { font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 16px; }

    /* Ring Section */
    .score-ring-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 12px 0;
    }
    .circle-wrap {
      position: relative;
      width: 160px;
      height: 160px;
    }
    .circle-svg {
      transform: rotate(-90deg);
      width: 160px;
      height: 160px;
    }
    .circle-bg {
      fill: none;
      stroke: #e2e8f0;
      stroke-width: 14;
    }
    .circle-bar {
      fill: none;
      stroke: ${nota >= 8 ? "var(--success)" : nota >= 6 ? "var(--primary)" : "var(--warning)"};
      stroke-width: 14;
      stroke-linecap: round;
      stroke-dasharray: 440;
      stroke-dashoffset: ${440 - (440 * (nota / 10))};
      transition: stroke-dashoffset 0.8s ease;
    }
    .circle-content {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .ring-score { font-size: 40px; font-weight: 800; color: var(--text-main); line-height: 1; }
    .ring-max { font-size: 13px; color: var(--text-muted); font-weight: 500; margin-top: 2px; }
    .ring-footer { margin-top: 16px; font-size: 13px; color: var(--text-muted); text-align: center; }

    /* Criteria Bars */
    .criteria-item { margin-bottom: 14px; }
    .criteria-header { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
    .criteria-name { font-weight: 600; color: var(--text-main); }
    .criteria-val { font-weight: 700; color: var(--text-main); }
    .progress-track { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }

    /* Histogram */
    .histo-container {
      display: flex;
      align-items: flex-end;
      height: 90px;
      gap: 6px;
      margin-top: 16px;
      padding-top: 10px;
      border-bottom: 1px solid var(--border-color);
    }
    .histo-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      justify-content: flex-end;
    }
    .histo-bar {
      width: 100%;
      background: #93c5fd;
      border-radius: 4px 4px 0 0;
      min-height: 2px;
      transition: height 0.5s ease;
    }
    .histo-bar:hover { background: var(--primary); }
    .histo-label { font-size: 10px; color: var(--text-muted); margin-top: 4px; }

    /* AI Section */
    .ai-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    @media (max-width: 768px) {
      .ai-grid { grid-template-columns: 1fr; }
    }
    .bullet-list { list-style: none; }
    .bullet-item {
      padding: 12px;
      margin-bottom: 12px;
      border-radius: 8px;
      font-size: 14px;
    }
    .bullet-item.strong {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #14532d;
    }
    .bullet-item.opp {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #78350f;
    }
    .badge-count {
      display: inline-block;
      font-weight: 700;
      background: rgba(0,0,0,0.08);
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      margin-bottom: 6px;
    }
    .script-box {
      margin-top: 8px;
      padding: 8px 12px;
      background: #ffffff;
      border-radius: 6px;
      border-left: 3px solid var(--warning);
      font-size: 12px;
      font-style: italic;
      color: #334155;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>${scopeTitle}</h1>
        <div class="period-badge">Período de Análise: <strong>${startStr}</strong> até <strong>${endStr}</strong></div>
      </div>
      <div>
        <span style="font-size: 12px; color: var(--text-muted);">Padrão Pry / FLW Quality v1</span>
      </div>
    </header>

    ${
      report.preliminar
        ? `<div class="preliminar-warning">⚠️ <strong>Amostra Preliminar:</strong> Menos de 10 atendimentos analisados neste recorte (${n} conversas). Os números devem ser lidos como indicativo inicial.</div>`
        : ""
    }

    <!-- 1. Faixa de KPIs Sintéticos -->
    <div class="kpi-strip">
      <div class="kpi-card">
        <div class="kpi-label">TMR Médio</div>
        <div class="kpi-value">${sinteticos.tmrMedioFormatado || "0s"}</div>
        <div class="kpi-sub">1ª resposta humana</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">FTR Mediana</div>
        <div class="kpi-value">${sinteticos.ftrMedianaFormatada || "0s"}</div>
        <div class="kpi-sub">Tempo de resolução</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Resp. Cliente</div>
        <div class="kpi-value">${sinteticos.respClientePct}%</div>
        <div class="kpi-sub">Atendimentos respondidos</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Sem Resposta</div>
        <div class="kpi-value" style="color: ${sinteticos.semRespostaPct > 15 ? 'var(--danger)' : 'inherit'}">${sinteticos.semRespostaPct}%</div>
        <div class="kpi-sub">Cliente ficou no vácuo</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Fechamento CRM</div>
        <div class="kpi-value">${sinteticos.taxaFechamentoPct !== null ? `${sinteticos.taxaFechamentoPct}%` : "N/D"}</div>
        <div class="kpi-sub">Cards WON no período</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Reativação</div>
        <div class="kpi-value">${sinteticos.reativacaoPct}%</div>
        <div class="kpi-sub">Retomada após ≥ 24h</div>
      </div>
    </div>

    <!-- 2. Grid Central: Anel de Qualidade + Barras dos 5 Critérios -->
    <div class="main-grid">
      <!-- Bloco Esquerdo: Anel 0-10 e Histograma -->
      <div class="card">
        <div class="card-title">Índice de Qualidade</div>
        <div class="score-ring-container">
          <div class="circle-wrap">
            <svg class="circle-svg" viewBox="0 0 160 160">
              <circle class="circle-bg" cx="80" cy="80" r="70"></circle>
              <circle class="circle-bar" cx="80" cy="80" r="70"></circle>
            </svg>
            <div class="circle-content">
              <span class="ring-score">${nota.toFixed(1)}</span>
              <span class="ring-max">de 10</span>
            </div>
          </div>
          <div class="ring-footer">
            Baseado em <strong>${n}</strong> conversas finalizadas
          </div>
        </div>

        <div style="margin-top: 20px;">
          <div style="font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Distribuição das Notas (0 a 10)</div>
          <div class="histo-container">
            ${histograma
              .map(
                (count, idx) => `
              <div class="histo-col" title="Nota ${idx}: ${count} conversas">
                <div class="histo-bar" style="height: ${Math.round((count / maxHisto) * 100)}%;"></div>
                <div class="histo-label">${idx}</div>
              </div>`
              )
              .join("")}
          </div>
        </div>
      </div>

      <!-- Bloco Direito: Barras dos 5 Critérios Analíticos -->
      <div class="card">
        <div class="card-title">Desempenho nos 5 Critérios Analíticos</div>

        <div class="criteria-item">
          <div class="criteria-header">
            <span class="criteria-name">Pouco ou Nenhum Atrito</span>
            <span class="criteria-val">${medias.atrito ?? "N/D"}/10</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${(medias.atrito ?? 0) * 10}%; background: #3b82f6;"></div>
          </div>
        </div>

        <div class="criteria-item">
          <div class="criteria-header">
            <span class="criteria-name">Apresentou Solução Clara</span>
            <span class="criteria-val">${medias.solucao ?? "N/D"}/10</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${(medias.solucao ?? 0) * 10}%; background: #10b981;"></div>
          </div>
        </div>

        <div class="criteria-item">
          <div class="criteria-header">
            <span class="criteria-name">Entendeu a Necessidade</span>
            <span class="criteria-val">${medias.necessidade ?? "N/D"}/10</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${(medias.necessidade ?? 0) * 10}%; background: #6366f1;"></div>
          </div>
        </div>

        <div class="criteria-item">
          <div class="criteria-header">
            <span class="criteria-name">Próximo Passo Combinado</span>
            <span class="criteria-val">${medias.proximoPasso ?? "N/D"}/10</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${(medias.proximoPasso ?? 0) * 10}%; background: #f59e0b;"></div>
          </div>
        </div>

        <div class="criteria-item">
          <div class="criteria-header">
            <span class="criteria-name">Conversa Resolvida no Diálogo</span>
            <span class="criteria-val">${medias.resolvida ?? "N/D"}/10</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${(medias.resolvida ?? 0) * 10}%; background: #8b5cf6;"></div>
          </div>
        </div>

        ${
          funil
            ? `
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-color);">
          <div style="font-size: 13px; font-weight: 700; margin-bottom: 10px;">Cards no Funil CRM</div>
          <div style="display: flex; gap: 12px; font-size: 13px; margin-bottom: 12px; flex-wrap: wrap;">
            <div style="background: #f1f5f9; padding: 6px 12px; border-radius: 6px;">Total Cards: <strong>${(funil.open || 0) + (funil.won || 0) + (funil.lost || 0)}</strong></div>
            <div style="background: #f1f5f9; padding: 6px 12px; border-radius: 6px;">Abertos: <strong>${funil.open || 0}</strong></div>
            <div style="background: #dcfce7; padding: 6px 12px; border-radius: 6px;">Ganhos (WON): <strong style="color: var(--success);">${funil.won || 0}</strong></div>
            <div style="background: #fee2e2; padding: 6px 12px; border-radius: 6px;">Perdidos (LOST): <strong style="color: var(--danger);">${funil.lost || 0}</strong></div>
          </div>
          ${
            funil.etapas && Object.keys(funil.etapas).length > 0
              ? `
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">Etapas do Pipeline</div>
          <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;">
            ${Object.entries(funil.etapas)
              .map(
                ([etapa, qtd]) => `
              <div style="display: flex; justify-content: space-between; font-size: 12px; padding: 4px 8px; background: #f8fafc; border-radius: 4px; border: 1px solid #f1f5f9;">
                <span>${etapa}</span>
                <strong>${qtd}</strong>
              </div>`
              )
              .join("")}
          </div>`
              : ""
          }
          ${
            funil.lostReasons && Object.keys(funil.lostReasons).length > 0
              ? `
          <div style="font-size: 11px; font-weight: 700; color: var(--danger); margin-bottom: 6px; text-transform: uppercase;">Motivos de Perda</div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${Object.entries(funil.lostReasons)
              .map(
                ([motivo, qtd]) => `
              <div style="display: flex; justify-content: space-between; font-size: 12px; padding: 4px 8px; background: #fef2f2; border-radius: 4px; border: 1px solid #fee2e2;">
                <span>${motivo}</span>
                <strong style="color: var(--danger);">${qtd}</strong>
              </div>`
              )
              .join("")}
          </div>`
              : ""
          }
        </div>`
            : ""
        }
      </div>
    </div>

    <!-- 3. Síntese Gerencial e Coaching (OpenAI Estágio 2) -->
    <div class="card">
      <div class="card-title">Diagnóstico Gerencial & Coaching com IA</div>
      <div class="ai-grid">
        <!-- Pontos Fortes -->
        <div>
          <h3 style="font-size: 14px; font-weight: 700; color: #166534; margin-bottom: 12px;">✅ Pontos Fortes Observados</h3>
          ${
            textoFortes.length === 0
              ? `<p style="font-size: 13px; color: var(--text-muted);">Nenhum ponto forte registrado.</p>`
              : `<ul class="bullet-list">
                  ${textoFortes
                    .map(
                      (tf) => `
                    <li class="bullet-item strong">
                      <span class="badge-count">${tf.n_casos} casos</span>
                      <div>${tf.texto}</div>
                    </li>`
                    )
                    .join("")}
                </ul>`
          }
        </div>

        <!-- Oportunidades -->
        <div>
          <h3 style="font-size: 14px; font-weight: 700; color: #854d0e; margin-bottom: 12px;">💡 Oportunidades & Scripts Sugeridos</h3>
          ${
            textoOps.length === 0
              ? `<p style="font-size: 13px; color: var(--text-muted);">Nenhuma oportunidade crítica registrada.</p>`
              : `<ul class="bullet-list">
                  ${textoOps
                    .map(
                      (to) => `
                    <li class="bullet-item opp">
                      <span class="badge-count">${to.n_casos} casos</span>
                      <div>${to.texto}</div>
                      ${
                        to.script_sugerido
                          ? `<div class="script-box"><strong>Script Sugerido:</strong> "${to.script_sugerido}"</div>`
                          : ""
                      }
                    </li>`
                    )
                    .join("")}
                </ul>`
          }
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function exportReportHtml(
  report: PeriodReport,
  scopeTitle: string,
  outputDir = "./reports",
  customFileName?: string
): Promise<string> {
  const html = generateReportHtml(report, scopeTitle);
  const dateStr = report.periodStart.toISOString().split("T")[0];
  const fileName = customFileName || `relatorio_${report.scopeType}_${report.scopeId}_${dateStr}.html`;
  const filePath = path.join(outputDir, fileName);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(filePath, html, "utf-8");

  return filePath;
}