import React from "react";
import type { TipoPeriodo } from "@/lib/labels";
import { PeriodPicker, type Intervalo } from "./PeriodPicker";

export type TabId = "visao" | "atendentes" | "conversas";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "visao", label: "Visão geral" },
  { id: "atendentes", label: "Atendentes" },
  { id: "conversas", label: "Conversas" },
];

interface AppHeaderProps {
  tab: TabId;
  onTab: (t: TabId) => void;
  tipo: TipoPeriodo;
  onTipo: (t: TipoPeriodo) => void;
  periods: Array<{ start: string; end: string }>;
  selectedPeriod: string;
  onPeriod: (start: string) => void;
  intervalo: Intervalo | null;
  onIntervalo: (i: Intervalo) => void;
  atualizado: string | null;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  tab,
  onTab,
  tipo,
  onTipo,
  periods,
  selectedPeriod,
  onPeriod,
  intervalo,
  onIntervalo,
  atualizado,
}) => (
  <header className="sticky top-0 z-40 bg-surface border-b border-line">
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 sm:min-h-16 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-primary text-white flex items-center justify-center text-lg font-semibold">T</div>
        <div className="flex flex-col">
          <span className="text-base leading-5 font-semibold">Tterrasul</span>
          <span className="text-xs text-muted">Qualidade do atendimento</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
        {atualizado && <span className="order-2 sm:order-1 text-xs text-muted">Atualizado {atualizado}</span>}
        <div className="order-1 sm:order-2">
          <PeriodPicker
            tipo={tipo}
            onTipo={onTipo}
            periods={periods}
            selectedPeriod={selectedPeriod}
            onPeriod={onPeriod}
            intervalo={intervalo}
            onIntervalo={onIntervalo}
          />
        </div>
      </div>
    </div>

    <nav aria-label="Seções" className="max-w-[1200px] mx-auto px-2 sm:px-3 flex">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onTab(t.id)}
          aria-current={tab === t.id ? "page" : undefined}
          className={`flex-1 sm:flex-none h-12 px-4 pt-[3px] flex items-center justify-center font-medium border-b-[3px] ${
            tab === t.id ? "text-primary border-primary" : "text-muted border-transparent hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  </header>
);
