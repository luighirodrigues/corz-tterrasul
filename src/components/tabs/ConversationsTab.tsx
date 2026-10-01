"use client";

import React, { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { SessionDetail } from "@/lib/types";
import { fmtDuracao, fmtNota, fmtPeriodo } from "@/lib/format";
import { scoreStatus, TONE_DOT } from "@/lib/labels";

interface ConversationsTabProps {
  sessions: SessionDetail[];
  periodStart?: string;
  periodEnd?: string;
  onOpen: (s: SessionDetail) => void;
}

export const ConversationsTab: React.FC<ConversationsTabProps> = ({ sessions, periodStart, periodEnd, onOpen }) => {
  const [busca, setBusca] = useState("");
  const lista = sessions.filter((s) => s.agentName.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl leading-8 font-medium">Conversas</h1>
          <span className="text-muted">
            {periodStart && periodEnd ? `Semana de ${fmtPeriodo(periodStart, periodEnd)} · ` : ""}clique em uma conversa para ler as mensagens e a avaliação
          </span>
        </div>
        <label className="flex items-center gap-2.5 w-full sm:w-[340px] h-11 px-4 rounded-full bg-subtle focus-within:bg-surface focus-within:shadow-menu">
          <Search className="w-5 h-5 text-muted shrink-0" strokeWidth={1.75} />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar por atendente"
            placeholder="Buscar por atendente"
            className="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
          />
        </label>
      </div>

      <section className="bg-surface border border-line rounded-card overflow-hidden">
        <div className="hidden md:grid grid-cols-[200px_minmax(0,1fr)_140px_110px_80px_24px] gap-4 items-center px-5 py-3 border-b border-line text-xs font-medium text-muted">
          <span>Atendente</span>
          <span>Resumo</span>
          <span>Painel</span>
          <span>Data</span>
          <span className="text-right">Nota</span>
          <span />
        </div>

        {lista.length === 0 && (
          <p className="px-5 py-8 text-[13px] text-muted">
            {busca.trim() ? `Nenhuma conversa encontrada para “${busca.trim()}”.` : "Nenhuma conversa avaliada nesta semana."}
          </p>
        )}

        {lista.map((s) => {
          const tone = scoreStatus(s.notaConversa).tone;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onOpen(s)}
              className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[200px_minmax(0,1fr)_140px_110px_80px_24px] gap-x-4 gap-y-1 items-center min-h-16 px-5 py-2.5 border-b border-divider last:border-b-0 hover:bg-page"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 shrink-0 rounded-full bg-primary-soft text-primary-ink text-[13px] font-semibold flex items-center justify-center">
                  {s.agentName.charAt(0)}
                </span>
                <span className="font-medium truncate">{s.agentName}</span>
              </span>
              <span className="flex md:hidden items-center justify-end gap-2 font-medium text-base">
                <span className={`w-2 h-2 rounded-full ${TONE_DOT[tone]}`} />
                {fmtNota(s.notaConversa)}
              </span>
              <span className="col-span-2 md:col-span-1 md:order-none text-ink-2 md:truncate line-clamp-2 md:line-clamp-none">
                {s.resumo1Linha ?? "Resumo indisponível"}
              </span>
              <span className="col-span-2 md:col-span-1 flex items-center gap-2 md:block">
                <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-subtle text-ink-2 text-xs font-medium">{s.panelName}</span>
                <span className="md:hidden text-xs text-muted">
                  {s.startAt?.slice(0, 5)} · {s.durationMinutes == null ? "—" : fmtDuracao(s.durationMinutes * 60)}
                </span>
              </span>
              <span className="hidden md:flex flex-col">
                <span>{s.startAt?.slice(0, 5) ?? "—"}</span>
                <span className="text-xs text-muted">{s.durationMinutes == null ? "—" : fmtDuracao(s.durationMinutes * 60)}</span>
              </span>
              <span className="hidden md:flex items-center justify-end gap-2 text-base font-medium">
                <span className={`w-2 h-2 rounded-full ${TONE_DOT[tone]}`} />
                {fmtNota(s.notaConversa)}
              </span>
              <ChevronRight className="hidden md:block w-5 h-5 text-muted" strokeWidth={1.75} />
            </button>
          );
        })}

        {sessions.length > 0 && (
          <div className="px-5 py-3.5 text-[13px] text-muted border-t border-divider">
            Mostrando as {sessions.length} conversas mais recentes da semana selecionada
          </div>
        )}
      </section>
    </div>
  );
};
