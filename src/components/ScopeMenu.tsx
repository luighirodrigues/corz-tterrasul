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

const GRUPOS = [
  { tipo: "geral", label: "Geral", nota: "" },
  { tipo: "divisao", label: "Divisões", nota: "Pós-venda e Veículos, somando as equipes de cada uma" },
  { tipo: "equipe", label: "Equipes", nota: "Grupos de atendentes" },
  { tipo: "painel", label: "Painéis do CRM", nota: "Conversas ligadas aos negócios de cada painel" },
] as const;

/** Um escopo sem nota, sem conversas e sem negócios no CRM não tem o que mostrar: sai do menu. */
const temConteudo = (r: ReportItem) => {
  if (r.scopeType === "geral" || r.notaGeral != null || r.sinteticos.n > 0) return true;
  const f = r.funil;
  return !!f && f.open + f.won + f.lost > 0;
};

export const ScopeMenu: React.FC<ScopeMenuProps> = ({ reports, selectedId, onSelect, title }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const fechar = (devolverFoco = true) => {
    setOpen(false);
    if (devolverFoco) botao.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fechar(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // O foco vai para o item escolhido.
    (menu.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu.current?.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const navegar = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const itens = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = itens.indexOf(e.target as HTMLElement);
    if (i < 0) return;
    const j = e.key === "Home" ? 0 : e.key === "End" ? itens.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length;
    e.preventDefault();
    itens[j]?.focus();
  };

  const grupos = GRUPOS.map((g) => ({ ...g, items: reports.filter((r) => r.scopeType === g.tipo && (temConteudo(r) || r.id === selectedId)) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <div ref={ref} className="relative self-start">
      <button
        ref={botao}
        type="button"
        onClick={() => (open ? fechar(false) : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 -ml-2 px-2 py-1 rounded-lg text-[22px] sm:text-2xl leading-8 font-medium hover:bg-subtle focus-visible:outline-2 outline-primary"
      >
        <span>{title}</span>
        <ChevronDown className="w-[22px] h-[22px] text-muted" strokeWidth={1.75} />
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Escolher a visão"
          onKeyDown={navegar}
          className="absolute z-20 top-full mt-1 -ml-2 w-80 max-w-[calc(100vw-32px)] max-h-[75vh] overflow-y-auto py-2 bg-surface rounded-card shadow-menu"
        >
          {grupos.map((g) => (
            <div key={g.tipo} role="group" aria-label={g.label}>
              <div className="px-4 pt-2.5 pb-1 text-xs font-medium text-muted">{g.label}</div>
              {g.items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={r.id === selectedId}
                  onClick={() => {
                    onSelect(r.id);
                    fechar();
                  }}
                  className={`flex w-full items-center justify-between h-10 px-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 outline-primary ${
                    r.id === selectedId ? "bg-primary-soft text-primary-ink font-medium" : "hover:bg-subtle"
                  }`}
                >
                  <span>{r.scopeType === "geral" ? "Visão geral da operação" : nomeEscopo(r.title)}</span>
                  {r.notaGeral == null ? (
                    <span className="text-muted font-normal text-[13px]">sem nota</span>
                  ) : (
                    <span className="text-muted font-normal">{fmtNota(r.notaGeral)}</span>
                  )}
                </button>
              ))}
              {g.nota && <div className="px-4 pt-1 pb-2 text-xs text-muted">{g.nota}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
