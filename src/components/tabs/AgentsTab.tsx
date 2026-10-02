import React from "react";
import { ChevronRight, Info } from "lucide-react";
import type { ReportItem } from "@/lib/types";
import { SEM_RESPOSTA_ALERT_PCT } from "@/lib/thresholds";
import { fmtDuracao, fmtNota, fmtPct, fmtTituloPeriodo } from "@/lib/format";
import { conversasAvaliadas, nomeEscopo, PERIODO, scoreStatus, TONE_CHIP, type TipoPeriodo } from "@/lib/labels";

interface AgentsTabProps {
  agents: ReportItem[];
  tipo: TipoPeriodo;
  periodStart?: string;
  periodEnd?: string;
  onOpen: (id: string) => void;
}

export const AgentsTab: React.FC<AgentsTabProps> = ({ agents, tipo, periodStart, periodEnd, onOpen }) => {
  const t = PERIODO[tipo];
  const sorted = [...agents].sort((a, b) => (b.notaGeral ?? -1) - (a.notaGeral ?? -1));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl leading-8 font-medium">Atendentes</h1>
          <span className="text-muted">
            {periodStart && periodEnd ? `${fmtTituloPeriodo(tipo, periodStart, periodEnd)} · ` : ""}ordenados pela {t.nota.toLowerCase()}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Info className="w-4 h-4" strokeWidth={1.75} />
          Amostra pequena = menos de 10 conversas avaliadas {t.na}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
        {sorted.map((ag, i) => {
          const status = scoreStatus(ag.notaGeral);
          const sr = ag.sinteticos.semRespostaPct;
          const tmr = ag.sinteticos.tmrMedioSegundos !== undefined ? fmtDuracao(ag.sinteticos.tmrMedioSegundos) : ag.sinteticos.tmrMedioFormatado || "—";
          return (
            <div key={ag.id} className="bg-surface border border-line rounded-card px-5 pt-5 pb-3 flex flex-col gap-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-[13px] font-semibold ${
                      i < 3 ? "bg-primary-soft text-primary-ink" : "bg-subtle text-muted"
                    }`}
                  >
                    {i + 1}º
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-base leading-6 font-medium truncate">{nomeEscopo(ag.title)}</span>
                    <span className="text-[13px] text-muted">
                      {ag.equipe ? `${ag.equipe} · ` : ""}
                      {conversasAvaliadas(ag.totalConversas)}
                    </span>
                  </div>
                </div>
                <span className="text-[28px] leading-8 font-medium">{fmtNota(ag.notaGeral)}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-xs font-medium ${TONE_CHIP[status.tone]}`}>{status.label}</span>
                {ag.preliminar && (
                  <span className="inline-flex items-center h-[22px] px-2 rounded-full border border-line text-xs font-medium text-muted">
                    Amostra pequena
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3.5 border-t border-divider">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted">1ª resposta</span>
                  <span className="text-[15px] font-medium">{tmr}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted">Sem resposta</span>
                  <span className={`text-[15px] font-medium ${(sr ?? 0) > SEM_RESPOSTA_ALERT_PCT ? "text-bad" : ""}`}>{fmtPct(sr)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpen(ag.id)}
                className="self-start inline-flex items-center gap-1 h-9 px-3 -ml-3 rounded-full text-primary font-medium hover:bg-primary-soft"
              >
                Ver detalhes
                <ChevronRight className="w-[18px] h-[18px]" strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
