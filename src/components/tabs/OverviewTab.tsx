"use client";

import React, { useState } from "react";
import { ArrowLeft, ChevronDown, Info } from "lucide-react";
import type { ReportItem } from "@/lib/types";
import type { TrendPoint } from "@/components/TrendChart";
import { TrendChart } from "@/components/TrendChart";
import { ScoreRing } from "@/components/ScoreRing";
import { KpiStrip } from "@/components/KpiStrip";
import { CriteriaBars } from "@/components/CriteriaBars";
import { HistogramChart } from "@/components/HistogramChart";
import { FunnelChart } from "@/components/FunnelChart";
import { AiInsightsBlock } from "@/components/AiInsightsBlock";
import { ScopeMenu } from "@/components/ScopeMenu";
import { fmtPeriodo } from "@/lib/format";
import { META_NOTA, MSG, nomeEscopo, scoreStatus, TONE_CHIP } from "@/lib/labels";

interface OverviewTabProps {
  report: ReportItem;
  scopeReports: ReportItem[];
  history: TrendPoint[];
  onSelect: (id: string) => void;
  onBackToAgents: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ report, scopeReports, history, onSelect, onBackToAgents }) => {
  const [obsOpen, setObsOpen] = useState(false);
  const isAgent = report.scopeType === "agente";
  const title = report.scopeType === "geral" ? "Visão geral da operação" : nomeEscopo(report.title);
  const status = scoreStatus(report.notaGeral);
  const observacoes = (report.limitacoes ?? "").split("\n").filter(Boolean);
  const delta = report.comparativo?.deltaNota;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {isAgent && (
          <button
            type="button"
            onClick={onBackToAgents}
            className="self-start inline-flex items-center gap-1 h-9 px-3 -ml-3 rounded-full text-primary font-medium hover:bg-primary-soft"
          >
            <ArrowLeft className="w-[18px] h-[18px]" strokeWidth={1.75} />
            Atendentes
          </button>
        )}
        {isAgent ? (
          <h1 className="text-[22px] sm:text-2xl leading-8 font-medium">{title}</h1>
        ) : (
          <ScopeMenu reports={scopeReports} selectedId={report.id} onSelect={onSelect} title={title} />
        )}
        <div className="text-muted">
          Semana de {fmtPeriodo(report.periodStart, report.periodEnd)} · {report.totalConversas}{" "}
          {report.totalConversas === 1 ? "conversa avaliada" : "conversas avaliadas"}
        </div>
      </div>

      {report.preliminar && (
        <div className="flex gap-2.5 px-3.5 py-3 rounded-card bg-warn-soft text-[13px] leading-[19px]">
          <Info className="w-5 h-5 text-warn shrink-0" strokeWidth={1.75} />
          <span>{MSG.amostraPequena}</span>
        </div>
      )}

      {report.correctedAt && (
        <div className="px-3.5 py-3 rounded-card bg-subtle text-[13px]">
          Corrigido em {new Date(report.correctedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}: {report.correctionReason}
        </div>
      )}

      {observacoes.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setObsOpen((o) => !o)}
            aria-expanded={obsOpen}
            className="flex items-center justify-between w-full h-12 px-4 rounded-card border border-line bg-surface"
          >
            <span className="inline-flex items-center gap-2.5">
              <Info className="w-[18px] h-[18px] text-muted" strokeWidth={1.75} />
              Observações sobre os dados ({observacoes.length})
            </span>
            <ChevronDown className={`w-[18px] h-[18px] text-muted transition-transform ${obsOpen ? "rotate-180" : ""}`} strokeWidth={1.75} />
          </button>
          {obsOpen && (
            <ul className="mt-2 px-4 py-3 rounded-card border border-line bg-surface text-[13px] leading-5 list-disc pl-8 flex flex-col gap-1">
              {observacoes.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <KpiStrip metrics={report.sinteticos} />

      <div className="flex flex-wrap gap-6 items-stretch">
        <section className="flex-[5_1_360px] bg-surface border border-line rounded-card p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-medium">Nota da semana</h2>
            <span className="text-[13px] text-muted">Média dos 5 critérios, de 0 a 10</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <ScoreRing score={report.notaGeral} />
            <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-xs font-medium ${TONE_CHIP[status.tone]}`}>
              {status.label}
              {report.notaGeral != null && ` · meta ${META_NOTA.toFixed(1).replace(".", ",")}`}
            </span>
            {delta != null && (
              <span
                className={`text-[13px] font-medium ${delta > 0 ? "text-good" : delta < 0 ? "text-bad" : "text-muted"}`}
                title="Compara com a semana anterior recalculada com a mesma régua; por isso pode diferir do ponto dela no gráfico."
              >
                {delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "• "}
                {delta.toFixed(1).replace(".", ",")} em relação à semana anterior
              </span>
            )}
          </div>
          <div className="border-t border-divider pt-5">
            <HistogramChart histogram={report.histograma} />
          </div>
          <div className="border-t border-divider pt-5 flex flex-col gap-2">
            <span className="text-sm font-medium">Evolução semanal</span>
            <TrendChart points={history} highlightStart={report.periodStart} />
          </div>
        </section>

        <section className="flex-[7_1_460px] bg-surface border border-line rounded-card p-6 flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-base font-medium">Critérios avaliados</h2>
              <span className="text-[13px] text-muted">Cada conversa recebe uma nota de 0 a 10 em cada critério</span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted whitespace-nowrap">
              <span className="w-0.5 h-3.5 rounded-sm bg-ink-2" />
              Meta {META_NOTA.toFixed(1).replace(".", ",")}
            </span>
          </div>
          <CriteriaBars scores={report.medias} />
        </section>
      </div>

      <FunnelChart funil={report.funil} />

      <AiInsightsBlock pontosFortes={report.textoFortes} oportunidades={report.textoOps} totalConversas={report.totalConversas} />
    </div>
  );
};
