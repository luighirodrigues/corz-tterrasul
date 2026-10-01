"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ReportItem } from "@/lib/types";
import { fmtNota } from "@/lib/format";
import { nomeEscopo } from "@/lib/labels";

interface ScopeMenuProps {
  reports: ReportItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  title: string;
}

export const ScopeMenu: React.FC<ScopeMenuProps> = ({ reports, selectedId, onSelect, title }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const groups = [
    { label: "Geral", items: reports.filter((r) => r.scopeType === "geral") },
    { label: "Divisões", items: reports.filter((r) => r.scopeType === "divisao") },
    { label: "Painéis do CRM", items: reports.filter((r) => r.scopeType === "painel") },
  ].filter((g) => g.items.length > 0);

  return (
    <div ref={ref} className="relative self-start">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-1.5 -ml-2 px-2 py-1 rounded-lg text-[22px] sm:text-2xl leading-8 font-medium hover:bg-subtle"
      >
        <span>{title}</span>
        <ChevronDown className="w-[22px] h-[22px] text-muted" strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute z-20 top-full mt-1 -ml-2 w-80 max-w-[calc(100vw-32px)] py-2 bg-surface rounded-card shadow-menu">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="px-4 pt-2.5 pb-1 text-xs font-medium text-muted">{g.label}</div>
              {g.items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    onSelect(r.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between h-10 px-4 text-left ${
                    r.id === selectedId ? "bg-primary-soft text-primary-ink font-medium" : "hover:bg-subtle"
                  }`}
                >
                  <span>{r.scopeType === "geral" ? "Visão geral da operação" : nomeEscopo(r.title)}</span>
                  <span className="text-muted font-normal">{fmtNota(r.notaGeral)}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
