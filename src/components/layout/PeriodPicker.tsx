"use client";

import React, { useEffect, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { DateTime } from "luxon";
import { fmtMes, fmtPeriodoCurto } from "@/lib/format";
import { PERIODO, type TipoPeriodo } from "@/lib/labels";

const TZ = "America/Sao_Paulo";

export interface Intervalo {
  de: string; // YYYY-MM-DD
  ate: string;
}

const TIPOS: Array<{ id: TipoPeriodo; label: string }> = [
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "livre", label: "Personalizado" },
];

const hoje = () => DateTime.now().setZone(TZ).startOf("day");

const ATALHOS: Array<{ label: string; intervalo: () => Intervalo }> = [
  { label: "Últimos 7 dias", intervalo: () => ({ de: hoje().minus({ days: 6 }).toISODate()!, ate: hoje().toISODate()! }) },
  { label: "Últimos 30 dias", intervalo: () => ({ de: hoje().minus({ days: 29 }).toISODate()!, ate: hoje().toISODate()! }) },
  { label: "Este mês", intervalo: () => ({ de: hoje().startOf("month").toISODate()!, ate: hoje().toISODate()! }) },
];

/** Intervalo inicial quando o gestor escolhe "Personalizado". */
export const ultimos30Dias = (): Intervalo => ATALHOS[1].intervalo();

interface PeriodPickerProps {
  tipo: TipoPeriodo;
  onTipo: (t: TipoPeriodo) => void;
  periods: Array<{ start: string; end: string }>;
  selectedPeriod: string;
  onPeriod: (start: string) => void;
  intervalo: Intervalo | null;
  onIntervalo: (i: Intervalo) => void;
}

export const PeriodPicker: React.FC<PeriodPickerProps> = ({ tipo, onTipo, periods, selectedPeriod, onPeriod, intervalo, onIntervalo }) => {
  // Rascunho das datas: só vale (e busca os dados) quando as duas estão preenchidas e na ordem certa.
  const [de, setDe] = useState(intervalo?.de ?? "");
  const [ate, setAte] = useState(intervalo?.ate ?? "");
  useEffect(() => {
    setDe(intervalo?.de ?? "");
    setAte(intervalo?.ate ?? "");
  }, [intervalo?.de, intervalo?.ate]);

  const tentar = (novoDe: string, novoAte: string) => {
    if (novoDe && novoAte && novoDe <= novoAte) onIntervalo({ de: novoDe, ate: novoAte });
  };
  const max = hoje().toISODate()!;
  const invertido = !!de && !!ate && de > ate;

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div role="group" aria-label="Tipo de período" className="inline-flex self-start h-11 sm:h-10 p-0.5 rounded-full border border-line bg-surface">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTipo(t.id)}
              aria-pressed={tipo === t.id}
              className={`px-3.5 rounded-full text-[13px] font-medium ${
                tipo === t.id ? "bg-primary-soft text-primary-ink" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tipo !== "livre" && (
          <label className="relative flex items-center gap-2 h-11 sm:h-10 pl-3.5 pr-3 rounded-lg border border-line bg-surface font-medium">
            <Calendar className="w-[18px] h-[18px] text-muted shrink-0" strokeWidth={1.75} />
            <select
              value={selectedPeriod}
              onChange={(e) => onPeriod(e.target.value)}
              aria-label={tipo === "mes" ? "Mês" : "Semana"}
              className="flex-1 appearance-none bg-transparent outline-none pr-6 cursor-pointer"
            >
              <option value="">{PERIODO[tipo].maisRecente}</option>
              {periods.map((p) => (
                <option key={p.start} value={p.start}>
                  {tipo === "mes" ? fmtMes(p.start) : fmtPeriodoCurto(p.start, p.end)}
                </option>
              ))}
            </select>
            <ChevronDown className="w-[18px] h-[18px] text-muted absolute right-3 pointer-events-none" strokeWidth={1.75} />
          </label>
        )}
      </div>

      {tipo === "livre" && (
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[13px] text-muted">
              De
              <input
                type="date"
                value={de}
                max={max}
                onChange={(e) => {
                  setDe(e.target.value);
                  tentar(e.target.value, ate);
                }}
                className="h-11 sm:h-10 px-3 rounded-lg border border-line bg-surface text-ink font-medium"
              />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-muted">
              até
              <input
                type="date"
                value={ate}
                max={max}
                onChange={(e) => {
                  setAte(e.target.value);
                  tentar(de, e.target.value);
                }}
                className="h-11 sm:h-10 px-3 rounded-lg border border-line bg-surface text-ink font-medium"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {ATALHOS.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => onIntervalo(a.intervalo())}
                className="inline-flex items-center h-9 px-3.5 rounded-full border border-line text-[13px] font-medium text-primary hover:bg-primary-soft"
              >
                {a.label}
              </button>
            ))}
          </div>
          {invertido && <span className="text-xs text-bad">A data final precisa ser igual ou depois da inicial.</span>}
        </div>
      )}
    </div>
  );
};
