import React from "react";
import type { ContagensConversas, ReportItem } from "@/lib/types";
import { ScoreRing } from "@/components/ScoreRing";
import { fmtInt, fmtNomeMes, fmtNota, fmtQtd } from "@/lib/format";
import { META_NOTA, PERIODO, scoreStatus, type Tone } from "@/lib/labels";
import { pontoMaisFraco, textoComparacao } from "@/lib/resumo";

interface SummaryBlockProps {
  report: ReportItem;
  /** Contagens da API de conversas: a mesma conta da lista. Null enquanto carrega. */
  contagens: ContagensConversas | null;
  /** Leva à aba Conversas já filtrada pelas que estão abaixo da meta. */
  onVerConversas: () => void;
}

const TOM_TEXTO: Record<Tone, string> = { good: "text-good", warn: "text-warn", bad: "text-bad", neutral: "text-muted" };

export const SummaryBlock: React.FC<SummaryBlockProps> = ({ report, contagens, onVerConversas }) => {
  const tipo = report.granularity;
  const t = PERIODO[tipo];
  const status = scoreStatus(report.notaGeral);
  const delta = report.comparativo?.deltaNota;
  const mesAnterior = report.comparativo ? fmtNomeMes(report.comparativo.periodoAnterior.start) : undefined;
  const fraco = pontoMaisFraco(report.medias);
  const abaixo = contagens?.abaixo ?? 0;

  if (report.notaGeral == null) {
    return (
      <section className="bg-surface border border-line rounded-card p-5 sm:p-6 text-ink-2">Nenhuma conversa com nota {t.nesta}.</section>
    );
  }

  const poucas = report.scopeType === "agente" && report.preliminar;

  return (
    <section className="bg-surface border border-line rounded-card p-5 sm:p-6 flex items-center gap-5 sm:gap-8">
      <div className="shrink-0">
        <ScoreRing score={report.notaGeral} size={112} />
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        {poucas ? (
          <>
            <span className="text-lg leading-6 font-medium">{fmtQtd(report.totalConversas, "conversa com nota", "conversas com nota")}</span>
            <span className="text-ink-2">Pouco para comparar.</span>
          </>
        ) : (
          <>
            <span className={`text-lg leading-6 font-medium ${TOM_TEXTO[status.tone]}`}>
              {status.label} de {fmtNota(META_NOTA)}
            </span>
            {delta != null && (
              <span
                className="text-ink-2"
                title={`Compara com ${tipo === "mes" ? "o mês anterior" : "a semana anterior"} recalculad${tipo === "mes" ? "o" : "a"} com a mesma régua; por isso pode diferir do ponto ${tipo === "mes" ? "dele" : "dela"} no gráfico.`}
              >
                {textoComparacao(delta, tipo, mesAnterior)}
              </span>
            )}
            <span className="text-ink-2">
              {fraco === null ? null : fraco.media >= META_NOTA ? (
                "Todos os critérios estão na meta"
              ) : (
                <>
                  Ponto mais fraco: {fraco.label}, média {fmtNota(fraco.media)}
                </>
              )}
            </span>
          </>
        )}
        {contagens && !poucas && (
          <span className="text-ink-2">
            {abaixo === 0
              ? "Nenhuma conversa ficou abaixo da meta"
              : `${fmtInt(abaixo)} ${abaixo === 1 ? "conversa ficou" : "conversas ficaram"} abaixo da meta`}
          </span>
        )}
        {abaixo > 0 && (
          <button
            type="button"
            onClick={onVerConversas}
            className="self-start mt-1 h-10 px-5 rounded-full bg-primary text-white font-medium hover:bg-primary-hover focus-visible:outline-2 outline-offset-2 outline-primary"
          >
            Ver essas conversas
          </button>
        )}
      </div>
    </section>
  );
};
