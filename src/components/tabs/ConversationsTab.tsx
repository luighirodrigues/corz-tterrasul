"use client";

import React, { useEffect, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { SessionDetail } from "@/lib/types";
import { fmtDuracao, fmtNota, fmtTituloPeriodo } from "@/lib/format";
import { MSG, PERIODO, scoreStatus, TONE_DOT, type TipoPeriodo } from "@/lib/labels";

const PAGE_SIZE = 50;

interface ConversationsTabProps {
  tipo: TipoPeriodo;
  periodStart?: string;
  periodEnd?: string;
  /** Período na API: "tipo=mes&period=..." ou "de=...&ate=...". */
  baseQuery: string;
  onOpen: (s: SessionDetail) => void;
}

interface Page {
  sessions: SessionDetail[];
  total: number;
}

export const ConversationsTab: React.FC<ConversationsTabProps> = ({ tipo, periodStart, periodEnd, baseQuery, onOpen }) => {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // A busca vai para o servidor: a lista é paginada e a conversa procurada pode estar numa página que ainda não veio.
  useEffect(() => {
    const h = setTimeout(() => setTermo(busca.trim()), 300);
    return () => clearTimeout(h);
  }, [busca]);

  const url = (offset: number) =>
    `/api/sessions?${baseQuery}&limit=${PAGE_SIZE}&offset=${offset}${termo ? `&q=${encodeURIComponent(termo)}` : ""}`;

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    fetch(url(0))
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const d: Page = await r.json();
        if (ativo) {
          setSessions(d.sessions);
          setTotal(d.total);
        }
      })
      .catch(() => ativo && setErro(MSG.erroDados))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseQuery, termo]);

  const carregarMais = async () => {
    setCarregandoMais(true);
    try {
      const r = await fetch(url(sessions.length));
      if (!r.ok) throw new Error(String(r.status));
      const d: Page = await r.json();
      setSessions((atual) => [...atual, ...d.sessions.filter((n) => !atual.some((s) => s.id === n.id))]);
      setTotal(d.total);
    } catch {
      setErro(MSG.erroDados);
    } finally {
      setCarregandoMais(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl leading-8 font-medium">Conversas</h1>
          <span className="text-muted">
            {periodStart && periodEnd ? `${fmtTituloPeriodo(tipo, periodStart, periodEnd)} · ` : ""}clique em uma conversa para ler as mensagens e a avaliação
          </span>
        </div>
        <label className="flex items-center gap-2.5 w-full sm:w-[340px] h-11 px-4 rounded-full bg-subtle focus-within:bg-surface focus-within:shadow-menu">
          <Search className="w-5 h-5 text-muted shrink-0" strokeWidth={1.75} />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar por atendente ou equipe"
            placeholder="Buscar por atendente ou equipe"
            className="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
          />
        </label>
      </div>

      {erro && <div className="p-4 rounded-card bg-bad-soft text-bad text-[13px]">{erro}</div>}

      <section className="bg-surface border border-line rounded-card overflow-hidden">
        <div className="hidden md:grid grid-cols-[200px_minmax(0,1fr)_140px_110px_80px_24px] gap-4 items-center px-5 py-3 border-b border-line text-xs font-medium text-muted">
          <span>Atendente</span>
          <span>Resumo</span>
          <span>Painel</span>
          <span>Data</span>
          <span className="text-right">Nota</span>
          <span />
        </div>

        {carregando && <p className="px-5 py-8 text-[13px] text-muted">{MSG.carregando}</p>}

        {!carregando && sessions.length === 0 && !erro && (
          <p className="px-5 py-8 text-[13px] text-muted">
            {termo ? `Nenhuma conversa encontrada para “${termo}”.` : PERIODO[tipo].nenhumaConversa}
          </p>
        )}

        {!carregando &&
          sessions.map((s) => {
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
                  <span className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{s.agentName}</span>
                    {s.equipe && <span className="text-xs text-muted truncate">{s.equipe}</span>}
                  </span>
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

        {!carregando && sessions.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-[13px] text-muted border-t border-divider">
            <span>
              Mostrando {sessions.length} de {total} {total === 1 ? "conversa" : "conversas"}, das mais recentes para as mais antigas
            </span>
            {sessions.length < total && (
              <button
                type="button"
                onClick={carregarMais}
                disabled={carregandoMais}
                className="h-10 px-5 rounded-full border border-line text-primary font-medium hover:bg-primary-soft disabled:opacity-60"
              >
                {carregandoMais ? MSG.carregando : "Carregar mais"}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
