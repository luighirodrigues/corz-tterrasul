import React from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { fmtPeriodoCurto } from "@/lib/format";

export type TabId = "visao" | "atendentes" | "conversas";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "visao", label: "Visão geral" },
  { id: "atendentes", label: "Atendentes" },
  { id: "conversas", label: "Conversas" },
];

interface AppHeaderProps {
  tab: TabId;
  onTab: (t: TabId) => void;
  periods: Array<{ start: string; end: string }>;
  selectedPeriod: string;
  onPeriod: (start: string) => void;
  atualizado: string | null;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ tab, onTab, periods, selectedPeriod, onPeriod, atualizado }) => (
  <header className="sticky top-0 z-40 bg-surface border-b border-line">
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 sm:py-0 sm:h-16 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-primary text-white flex items-center justify-center text-lg font-semibold">T</div>
        <div className="flex flex-col">
          <span className="text-base leading-5 font-semibold">Tterrasul</span>
          <span className="text-xs text-muted">Qualidade do atendimento</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
        {atualizado && <span className="order-2 sm:order-1 text-xs text-muted">Atualizado {atualizado}</span>}
        <label className="order-1 sm:order-2 relative flex items-center gap-2 h-11 sm:h-10 pl-3.5 pr-3 rounded-lg border border-line bg-surface font-medium">
          <Calendar className="w-[18px] h-[18px] text-muted shrink-0" strokeWidth={1.75} />
          <select
            value={selectedPeriod}
            onChange={(e) => onPeriod(e.target.value)}
            aria-label="Semana"
            className="flex-1 appearance-none bg-transparent outline-none pr-6 cursor-pointer"
          >
            <option value="">Semana mais recente</option>
            {periods.map((p) => (
              <option key={p.start} value={p.start}>
                {fmtPeriodoCurto(p.start, p.end)}
              </option>
            ))}
          </select>
          <ChevronDown className="w-[18px] h-[18px] text-muted absolute right-3 pointer-events-none" strokeWidth={1.75} />
        </label>
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
