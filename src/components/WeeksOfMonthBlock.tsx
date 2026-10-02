"use client";

import React, { useEffect, useState } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";
import { fmtDiaMes, fmtNota } from "@/lib/format";
import { scoreStatus, TONE_DOT } from "@/lib/labels";

interface Semana {
  periodStart: string;
  periodEnd: string;
  publicada: boolean;
  notaGeral: number | null;
  n: number;
  preliminar: boolean;
}

interface WeeksOfMonthBlockProps {
  /** Início do mês ("YYYY-MM-DD"), como vem no relatório. */
  mesInicio: string;
  scopeType: string;
  scopeId: string;
  /** Abre a semana (início ISO) na visão semanal. */
  onOpenWeek: (periodStart: string) => void;
}

/** A nota oficial de cada semana do mês. A nota do mês é calculada de todas as conversas; não é a média destas. */
export const WeeksOfMonthBlock: React.FC<WeeksOfMonthBlockProps> = ({ mesInicio, scopeType, scopeId, onOpenWeek }) => {
  const [semanas, setSemanas] = useState<Semana[] | null>(null);

  useEffect(() => {
    let ativo = true;
    setSemanas(null);
    fetch(`/api/reports/weeks?period=${encodeURIComponent(mesInicio)}&scopeType=${scopeType}&scopeId=${encodeURIComponent(scopeId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => ativo && setSemanas(d))
      .catch(() => ativo && setSemanas([]));
    return () => {
      ativo = false;
    };
  }, [mesInicio, scopeType, scopeId]);

  if (!semanas || semanas.length === 0) return null;

  return (
    <section className="bg-surface border border-line rounded-card p-6 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <CalendarDays className="w-[22px] h-[22px] text-primary" strokeWidth={1.75} />
        <div className="flex flex-col">
          <h2 className="text-base font-medium">Semanas do mês</h2>
          <span className="text-[13px] text-muted">A nota publicada de cada semana. Clique para abrir a semana.</span>
        </div>
      </div>
      <div className="flex flex-col">
        {semanas.map((s) => {
          const tone = scoreStatus(s.notaGeral).tone;
          const conteudo = (
            <>
              <span className="flex-1 min-w-0">
                {fmtDiaMes(s.periodStart)} a {fmtDiaMes(s.periodEnd)}
              </span>
              {s.publicada ? (
                <>
                  <span className="text-[13px] text-muted whitespace-nowrap">
                    {s.n} {s.n === 1 ? "conversa" : "conversas"}
                    {s.preliminar ? " · amostra pequena" : ""}
                  </span>
                  <span className="flex items-center justify-end gap-2 w-16 text-base font-medium">
                    <span className={`w-2 h-2 rounded-full ${TONE_DOT[tone]}`} />
                    {fmtNota(s.notaGeral)}
                  </span>
                  <ChevronRight className="w-5 h-5 text-muted shrink-0" strokeWidth={1.75} />
                </>
              ) : (
                <span className="text-[13px] text-muted">Sem resultado publicado</span>
              )}
            </>
          );
          return s.publicada ? (
            <button
              key={s.periodStart}
              type="button"
              onClick={() => onOpenWeek(s.periodStart)}
              className="w-full text-left flex items-center gap-4 min-h-12 px-3 -mx-3 border-b border-divider last:border-b-0 hover:bg-page rounded-lg"
            >
              {conteudo}
            </button>
          ) : (
            <div key={s.periodStart} className="flex items-center gap-4 min-h-12 border-b border-divider last:border-b-0">
              {conteudo}
            </div>
          );
        })}
      </div>
    </section>
  );
};
