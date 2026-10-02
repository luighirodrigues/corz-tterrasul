import React from "react";
import { PeriodPicker, type PeriodPickerProps } from "./PeriodPicker";

export type TabId = "visao" | "atendentes" | "conversas";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "visao", label: "Visão geral" },
  { id: "atendentes", label: "Atendentes" },
  { id: "conversas", label: "Conversas" },
];

interface AppHeaderProps extends PeriodPickerProps {
  tab: TabId;
  onTab: (t: TabId) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ tab, onTab, ...period }) => (
  <header className="sticky top-0 z-40 bg-surface border-b border-line">
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 shrink-0 rounded-[10px] bg-primary text-white flex items-center justify-center text-lg font-semibold">T</div>
        <div className="flex flex-col min-w-0">
          <span className="text-base leading-5 font-semibold">Tterrasul</span>
          <span className="hidden sm:block text-xs text-muted">Qualidade do atendimento</span>
        </div>
      </div>
      <PeriodPicker {...period} />
    </div>

    <nav aria-label="Seções" className="max-w-[1200px] mx-auto px-2 sm:px-3 flex">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onTab(t.id)}
          aria-current={tab === t.id ? "page" : undefined}
          className={`flex-1 sm:flex-none h-12 px-4 pt-[3px] flex items-center justify-center font-medium border-b-[3px] focus-visible:outline-2 focus-visible:-outline-offset-2 outline-primary ${
            tab === t.id ? "text-primary border-primary" : "text-muted border-transparent hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  </header>
);
