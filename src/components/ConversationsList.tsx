"use client";

import React, { useEffect, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { ContagensConversas, FaixaConversas, OrdemConversas, SessionDetail } from "@/lib/types";
import { fmtDiaMes, fmtDuracao, fmtInt, fmtNota, fmtQtd } from "@/lib/format";
import { MSG, PERIODO, scoreStatus, TONE_DOT, textoAnonimo, type TipoPeriodo } from "@/lib/labels";
import { TextoAnonimo } from "@/components/TextoAnonimo";

const PAGE_SIZE = 50;

export interface EscopoConversas {
  scopeType: string;
  scopeId: string;
}

interface ConversationsListProps {
  tipo: TipoPeriodo;
  /** Período na API: "tipo=mes&period=..." ou "de=...&ate=...". */
  baseQuery: string;
  /** Só as conversas deste escopo do relatório (equipe, painel, atendente...). */
  escopo?: EscopoConversas | null;
  faixa: FaixaConversas | null;
  onFaixa: (f: FaixaConversas | null) => void;
  /** Mostra a busca por atendente ou equipe (a ficha do atendente não tem). */
  comBusca?: boolean;
  onOpen: (s: SessionDetail) => void;
  onContagens?: (c: ContagensConversas) => void;
}

interface Page {
  sessions: SessionDetail[];
  total: number;
  contagens: ContagensConversas;
}

const FILTROS: Array<{ id: FaixaConversas | null; label: string; conta: (c: ContagensConversas) => number }> = [
  { id: null, label: "Todas", conta: (c) => c.todas },
  { id: "abaixo", label: "Abaixo da meta", conta: (c) => c.abaixo },
  { id: "meta", label: "Na meta", conta: (c) => c.naMeta },
  { id: "sem", label: "Sem nota", conta: (c) => c.semNota },
];

const VAZIO_FILTRO: Record<FaixaConversas, string> = {
  abaixo: "Nenhuma conversa abaixo da meta",
  meta: "Nenhuma conversa na meta",
  sem: "Nenhuma conversa sem nota",
};

export const ConversationsList: React.FC<ConversationsListProps> = ({ tipo, baseQuery, escopo, faixa, onFaixa, comBusca = true, onOpen, onContagens }) => {
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [ordem, setOrdem] = useState<OrdemConversas>("recentes");
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [contagens, setContagens] = useState<ContagensConversas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  // A busca vai para o servidor: a lista é paginada e a conversa procurada pode estar numa página que ainda não veio.
  useEffect(() => {
    const h = setTimeout(() => setTermo(busca.trim()), 300);
    return () => clearTimeout(h);
  }, [busca]);

  const url = (offset: number) =>
    `/api/sessions?${baseQuery}&limit=${PAGE_SIZE}&offset=${offset}&ordem=${ordem}` +
    (faixa ? `&faixa=${faixa}` : "") +
    (termo ? `&q=${encodeURIComponent(termo)}` : "") +
    (escopo ? `&scopeType=${encodeURIComponent(escopo.scopeType)}&scopeId=${encodeURIComponent(escopo.scopeId)}` : "");

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
          setContagens(d.contagens);
          onContagens?.(d.contagens);
        }
      })
      .catch(() => ativo && setErro(MSG.erroDados))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseQuery, termo, faixa, ordem, escopo?.scopeType, escopo?.scopeId, tentativa]);

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

  const vazio = termo
    ? `Nenhuma conversa encontrada para “${termo}”.`
    : faixa
      ? `${VAZIO_FILTRO[faixa]} ${PERIODO[tipo].nesta}.`
      : `Nenhuma conversa ${PERIODO[tipo].nesta}.`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filtrar conversas" className="flex flex-wrap gap-2">
          {FILTROS.map((f) => {
            const marcado = faixa === f.id;
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => onFaixa(f.id)}
                aria-pressed={marcado}
                className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[13px] font-medium focus-visible:outline-2 outline-offset-2 outline-primary ${
                  marcado ? "bg-primary-soft border-primary-soft text-primary-ink" : "border-line text-ink-2 hover:bg-subtle"
                }`}
              >
                {f.label}
                {contagens && <span className={marcado ? "text-primary-ink" : "text-muted"}>{fmtInt(f.conta(contagens))}</span>}
              </button>
            );
          })}
        </div>
        <label className="inline-flex items-center gap-2 text-[13px] text-muted">
          Ordem
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as OrdemConversas)}
            className="h-9 px-2.5 rounded-lg border border-line bg-surface text-ink font-medium focus-visible:outline-2 outline-primary"
          >
            <option value="recentes">Mais recentes</option>
            <option value="nota">Menor nota primeiro</option>
          </select>
        </label>
      </div>

      {comBusca && (
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
      )}

      {erro && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-card bg-bad-soft text-bad text-[13px]">
          <span>{erro}</span>
          <button
            type="button"
            onClick={() => setTentativa((n) => n + 1)}
            className="h-9 px-4 rounded-full border border-bad/40 font-medium hover:bg-surface focus-visible:outline-2 outline-primary"
          >
            Tentar de novo
          </button>
        </div>
      )}

      <section className="bg-surface border border-line rounded-card overflow-hidden">
        <div className="hidden md:grid grid-cols-[200px_minmax(0,1fr)_140px_110px_80px_24px] gap-4 items-center px-5 py-3 border-b border-line text-xs font-medium text-muted">
          <span>Atendente</span>
          <span>Resumo</span>
          <span>Etapa no CRM</span>
          <span>Data</span>
          <span className="text-right">Nota</span>
          <span />
        </div>

        {carregando && <p className="px-5 py-8 text-[13px] text-muted">{MSG.carregando}</p>}

        {!carregando && sessions.length === 0 && !erro && (
          <div className="flex flex-wrap items-center gap-3 px-5 py-8 text-[13px] text-muted">
            <span>{vazio}</span>
            {(faixa || termo) && (
              <button
                type="button"
                onClick={() => {
                  onFaixa(null);
                  setBusca("");
                }}
                className="h-9 px-4 rounded-full border border-line text-primary font-medium hover:bg-primary-soft focus-visible:outline-2 outline-primary"
              >
                Ver todas as conversas
              </button>
            )}
          </div>
        )}

        {!carregando &&
          sessions.map((s) => {
            const tone = scoreStatus(s.notaConversa).tone;
            const duracao = s.durationMinutes == null ? "—" : fmtDuracao(s.durationMinutes * 60);
            const dia = s.startAt ? fmtDiaMes(s.startAt) : "—";
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onOpen(s)}
                aria-label={`${s.agentName}, nota ${fmtNota(s.notaConversa)}. ${textoAnonimo(s.resumo1Linha ?? "Resumo indisponível")}`}
                className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[200px_minmax(0,1fr)_140px_110px_80px_24px] gap-x-4 gap-y-1 items-center min-h-16 px-5 py-2.5 border-b border-divider last:border-b-0 hover:bg-page focus-visible:outline-2 focus-visible:-outline-offset-2 outline-primary"
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
                  {s.resumo1Linha ? <TextoAnonimo texto={s.resumo1Linha} /> : "Resumo indisponível"}
                </span>
                <span className="col-span-2 md:col-span-1 flex items-center gap-2 md:block">
                  {s.panelName ? (
                    <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-subtle text-ink-2 text-xs font-medium">{s.panelName}</span>
                  ) : (
                    <span className="text-xs text-muted">Sem negócio</span>
                  )}
                  <span className="md:hidden text-xs text-muted">
                    {dia}, {duracao}
                  </span>
                </span>
                <span className="hidden md:flex flex-col">
                  <span>{dia}</span>
                  <span className="text-xs text-muted">{duracao}</span>
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
              Mostrando {fmtInt(sessions.length)} de {fmtQtd(total, "conversa", "conversas")}
            </span>
            {sessions.length < total && (
              <button
                type="button"
                onClick={carregarMais}
                disabled={carregandoMais}
                className="h-10 px-5 rounded-full border border-line text-primary font-medium hover:bg-primary-soft disabled:opacity-60 focus-visible:outline-2 outline-primary"
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
