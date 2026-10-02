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
import { HighlightsBlock } from "@/components/HighlightsBlock";
import { WeeksOfMonthBlock } from "@/components/WeeksOfMonthBlock";
import { ScopeMenu } from "@/components/ScopeMenu";
import { fmtDadosAte, fmtNomeMes, fmtTituloPeriodo } from "@/lib/format";
import { emRelacaoA, META_NOTA, MSG, nomeEscopo, PERIODO, scoreStatus, TONE_CHIP } from "@/lib/labels";

interface OverviewTabProps {
  report: ReportItem;
  scopeReports: ReportItem[];
  history: TrendPoint[];
  onSelect: (id: string) => void;
  onBackToAgents: () => void;
  /** Abre uma semana (início ISO) na visão semanal, a partir do bloco "Semanas do mês". */
  onOpenWeek: (periodStart: string) => void;
  /** Abre uma conversa pelo id, a partir das "conversas em destaque". */
  onOpenSession: (sessionExternalId: string) => void;
}

/** Observações que mudam o que o número significa: ganham destaque em vez de ficarem na lista recolhida. */
const AVISO_DESTAQUE = /^(Dados a partir de|O período começa antes dos dados)/;

export const OverviewTab: React.FC<OverviewTabProps> = ({
  report,
  scopeReports,
  history,
  onSelect,
  onBackToAgents,
  onOpenWeek,
  onOpenSession,
}) => {
  const [obsOpen, setObsOpen] = useState(false);
  const tipo = report.granularity;
  const t = PERIODO[tipo];
  const isAgent = report.scopeType === "agente";
  const title = report.scopeType === "geral" ? "Visão geral da operação" : nomeEscopo(report.title);
  const status = scoreStatus(report.notaGeral);
  const todasObs = (report.limitacoes ?? "").split("\n").filter(Boolean);
  const avisos = todasObs.filter((l) => AVISO_DESTAQUE.test(l));
  const observacoes = todasObs.filter((l) => !AVISO_DESTAQUE.test(l));
  const delta = report.comparativo?.deltaNota;
  const mesAnterior = report.comparativo ? fmtNomeMes(report.comparativo.periodoAnterior.start) : undefined;
  const semAvaliacao = report.semAvaliacao ?? 0;

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
          {fmtTituloPeriodo(tipo, report.periodStart, report.periodEnd)} · {report.totalConversas}{" "}
          {report.totalConversas === 1 ? "conversa avaliada" : "conversas avaliadas"}
        </div>
        {report.calculadoAgora && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1">
            <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-primary-soft text-primary-ink text-xs font-medium">
              Calculado agora
            </span>
            {report.dadosAte && <span className="text-xs text-muted">Com dados até {fmtDadosAte(report.dadosAte)}</span>}
          </div>
        )}
      </div>

      {avisos.map((a, i) => (
        <div key={i} className="flex gap-2.5 px-3.5 py-3 rounded-card bg-warn-soft text-[13px] leading-[19px]">
          <Info className="w-5 h-5 text-warn shrink-0" strokeWidth={1.75} />
          <span>{a}</span>
        </div>
      ))}

      {semAvaliacao > 0 && (
        <div className="flex gap-2.5 px-3.5 py-3 rounded-card bg-warn-soft text-[13px] leading-[19px]">
          <Info className="w-5 h-5 text-warn shrink-0" strokeWidth={1.75} />
          <span>
            {semAvaliacao === 1 ? "1 conversa ainda sem avaliação" : `${semAvaliacao} conversas ainda sem avaliação`}. Elas já entram nos
            indicadores, mas só recebem nota depois da próxima análise.
          </span>
        </div>
      )}

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
            <h2 className="text-base font-medium">{t.nota}</h2>
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
                title={`Compara com ${tipo === "mes" ? "o mês anterior" : "a semana anterior"} recalculad${tipo === "mes" ? "o" : "a"} com a mesma régua; por isso pode diferir do ponto ${tipo === "mes" ? "dele" : "dela"} no gráfico.`}
              >
                {delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "• "}
                {delta.toFixed(1).replace(".", ",")} {emRelacaoA(tipo, mesAnterior)}
              </span>
            )}
            {tipo === "mes" && (
              <span className="text-xs text-muted text-center">Calculada com todas as conversas do mês; não é a média das semanas.</span>
            )}
          </div>
          <div className="border-t border-divider pt-5">
            <HistogramChart histogram={report.histograma} />
          </div>
          <div className="border-t border-divider pt-5 flex flex-col gap-2">
            <span className="text-sm font-medium">{t.evolucao}</span>
            <TrendChart
              points={history}
              highlightStart={tipo === "livre" ? undefined : report.periodStart}
              unidade={tipo === "mes" ? "mes" : "semana"}
            />
            {tipo === "livre" && <span className="text-xs text-muted">O gráfico mostra as semanas publicadas, não o período escolhido.</span>}
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

      {tipo === "mes" && (
        <WeeksOfMonthBlock mesInicio={report.periodStart} scopeType={report.scopeType} scopeId={report.scopeId} onOpenWeek={onOpenWeek} />
      )}

      <FunnelChart funil={report.funil} na={t.na} />

      {tipo === "livre" ? (
        <HighlightsBlock destaques={report.destaques} onOpen={onOpenSession} />
      ) : (
        <AiInsightsBlock
          pontosFortes={report.textoFortes}
          oportunidades={report.textoOps}
          totalConversas={report.totalConversas}
          tipo={tipo}
        />
      )}
    </div>
  );
};
