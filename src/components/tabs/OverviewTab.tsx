"use client";

import React, { useState } from "react";
import { ArrowLeft, ChevronDown, Info } from "lucide-react";
import type { ContagensConversas, ReportItem } from "@/lib/types";
import type { TrendPoint } from "@/components/TrendChart";
import { TrendChart } from "@/components/TrendChart";
import { SummaryBlock } from "@/components/SummaryBlock";
import { KpiStrip } from "@/components/KpiStrip";
import { CriteriaBars } from "@/components/CriteriaBars";
import { HistogramChart } from "@/components/HistogramChart";
import { FunnelChart } from "@/components/FunnelChart";
import { AiInsightsBlock } from "@/components/AiInsightsBlock";
import { HighlightsBlock } from "@/components/HighlightsBlock";
import { WeeksOfMonthBlock } from "@/components/WeeksOfMonthBlock";
import { ScopeMenu } from "@/components/ScopeMenu";
import { fmtDadosAte, fmtInt, fmtQtd, fmtTituloPeriodo } from "@/lib/format";
import { META_NOTA, MSG, nomeEscopo, PERIODO } from "@/lib/labels";
import { traduzirLimitacoes } from "@/lib/observacoes";

interface OverviewTabProps {
  report: ReportItem;
  scopeReports: ReportItem[];
  history: TrendPoint[];
  /** Contagens da API de conversas para este escopo e período; null enquanto carrega. */
  contagens: ContagensConversas | null;
  onSelect: (id: string) => void;
  onBackToAgents: () => void;
  /** Abre uma semana (início ISO) na visão semanal, a partir do bloco "Semanas do mês". */
  onOpenWeek: (periodStart: string) => void;
  /** Abre uma conversa pelo id, a partir das "conversas em destaque". */
  onOpenSession: (sessionExternalId: string) => void;
  /** Leva às conversas abaixo da meta deste escopo. */
  onVerConversas: () => void;
  /** Entra depois dos blocos e antes das observações (a ficha do atendente põe aqui a lista de conversas). */
  children?: React.ReactNode;
}

const Aviso: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex gap-2.5 px-3.5 py-3 rounded-card bg-warn-soft text-[13px] leading-[19px]">
    <Info className="w-5 h-5 text-warn shrink-0" strokeWidth={1.75} />
    <span>{children}</span>
  </div>
);

export const OverviewTab: React.FC<OverviewTabProps> = ({
  report,
  scopeReports,
  history,
  contagens,
  onSelect,
  onBackToAgents,
  onOpenWeek,
  onOpenSession,
  onVerConversas,
  children,
}) => {
  const [obsOpen, setObsOpen] = useState(false);
  const tipo = report.granularity;
  const t = PERIODO[tipo];
  const isAgent = report.scopeType === "agente";
  const title = report.scopeType === "geral" ? "Visão geral da operação" : nomeEscopo(report.title);
  const { avisos, observacoes } = traduzirLimitacoes(report.limitacoes);
  const semAvaliacao = report.semAvaliacao ?? 0;
  const semNota = report.notaGeral == null;
  // Com poucas conversas, a distribuição, a evolução e a análise da IA não dizem nada.
  const poucas = isAgent && report.preliminar;
  const temEvolucao = history.length >= 2 && !poucas;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {isAgent && (
          <button
            type="button"
            onClick={onBackToAgents}
            className="self-start inline-flex items-center gap-1 h-9 px-3 -ml-3 rounded-full text-primary font-medium hover:bg-primary-soft focus-visible:outline-2 outline-primary"
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
          {fmtTituloPeriodo(tipo, report.periodStart, report.periodEnd)}, {fmtQtd(report.totalConversas, "conversa com nota", "conversas com nota")}
        </div>
        {report.calculadoAgora && (
          <div className="text-xs text-muted">
            Calculado agora{report.dadosAte ? `, com dados até ${fmtDadosAte(report.dadosAte)}` : ""}
          </div>
        )}
      </div>

      <SummaryBlock report={report} contagens={contagens} onVerConversas={onVerConversas} />

      {avisos.map((a, i) => (
        <Aviso key={i}>{a}</Aviso>
      ))}

      {semAvaliacao > 0 && (
        <Aviso>
          {semAvaliacao === 1 ? "1 conversa ainda sem avaliação" : `${fmtInt(semAvaliacao)} conversas ainda sem avaliação`}. Elas já entram nos
          indicadores, mas só recebem nota depois da próxima análise.
        </Aviso>
      )}

      {report.preliminar && !poucas && <Aviso>{MSG.amostraPequena}</Aviso>}

      {report.correctedAt && (
        <div className="px-3.5 py-3 rounded-card bg-subtle text-[13px]">
          Corrigido em {new Date(report.correctedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}: {report.correctionReason}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <KpiStrip metrics={report.sinteticos} />
        <span className="text-xs text-muted">
          Calculados sobre {fmtQtd(report.sinteticos.n, "conversa que começou", "conversas que começaram")} {t.na}
        </span>
      </div>

      {!semNota && !poucas && (
        <div className="flex flex-wrap gap-6 items-stretch">
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
            {tipo === "mes" && (
              <span className="text-xs text-muted">Calculada com todas as conversas do mês; não é a média das semanas.</span>
            )}
          </section>

          <section className="flex-[5_1_360px] bg-surface border border-line rounded-card p-6 flex flex-col gap-5">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-base font-medium">Distribuição das notas</h2>
              <span className="text-[13px] text-muted">Quantas conversas tiveram cada nota</span>
            </div>
            <HistogramChart histogram={report.histograma} naMeta={contagens ? contagens.naMeta : null} />
            {temEvolucao && (
              <div className="border-t border-divider pt-5 flex flex-col gap-2">
                <span className="text-sm font-medium">{t.evolucao}</span>
                <TrendChart
                  points={history}
                  highlightStart={tipo === "livre" ? undefined : report.periodStart}
                  unidade={tipo === "mes" ? "mes" : "semana"}
                />
                {tipo === "livre" && <span className="text-xs text-muted">O gráfico mostra as semanas publicadas, não o período escolhido.</span>}
              </div>
            )}
          </section>
        </div>
      )}

      {!poucas &&
        (tipo === "livre" ? (
          <HighlightsBlock destaques={report.destaques} onOpen={onOpenSession} />
        ) : (
          <AiInsightsBlock
            pontosFortes={report.textoFortes}
            oportunidades={report.textoOps}
            totalConversas={report.totalConversas}
            tipo={tipo}
          />
        ))}

      <FunnelChart funil={report.funil} na={t.na} />

      {tipo === "mes" && (
        <WeeksOfMonthBlock mesInicio={report.periodStart} scopeType={report.scopeType} scopeId={report.scopeId} onOpenWeek={onOpenWeek} />
      )}

      {children}

      {observacoes.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setObsOpen((o) => !o)}
            aria-expanded={obsOpen}
            className="flex items-center justify-between w-full h-12 px-4 rounded-card border border-line bg-surface focus-visible:outline-2 outline-primary"
          >
            <span className="inline-flex items-center gap-2.5">
              <Info className="w-[18px] h-[18px] text-muted" strokeWidth={1.75} />
              Observações sobre os dados ({observacoes.length})
            </span>
            <ChevronDown
              className={`w-[18px] h-[18px] text-muted transition-transform motion-reduce:transition-none ${obsOpen ? "rotate-180" : ""}`}
              strokeWidth={1.75}
            />
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
    </div>
  );
};
