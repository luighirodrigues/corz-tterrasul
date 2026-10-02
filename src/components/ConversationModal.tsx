"use client";

import React, { useEffect, useRef, useState } from "react";
import type { SessionDetail } from "@/lib/types";
import { AUTOMATED_ORIGINS } from "@/domain/message-kind";
import { Bot, Clock, Layers, User, X } from "lucide-react";
import { CRITERIOS, MSG, origemAutomatica, scoreStatus, TONE_CHIP } from "@/lib/labels";
import { fmtDia, fmtDuracao, fmtNota } from "@/lib/format";
import { TextoAnonimo } from "@/components/TextoAnonimo";

interface ConversationModalProps {
  session: SessionDetail | null;
  /** As mensagens ainda estão vindo (a lista não as traz). */
  carregando?: boolean;
  onClose: () => void;
}

type Aba = "avaliacao" | "mensagens";

export const ConversationModal: React.FC<ConversationModalProps> = ({ session, carregando, onClose }) => {
  const [aba, setAba] = useState<Aba>("avaliacao");
  const fechar = useRef<HTMLButtonElement>(null);
  const id = session?.id;

  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, onClose]);

  // Ao abrir outra conversa, volta para a avaliação e põe o foco na janela.
  useEffect(() => {
    if (!id) return;
    setAba("avaliacao");
    fechar.current?.focus();
  }, [id]);

  if (!session) return null;
  const status = scoreStatus(session.notaConversa);
  const duracao = session.durationMinutes == null ? null : fmtDuracao(session.durationMinutes * 60);

  const detalhes = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
      <span className="inline-flex items-center gap-1.5">
        <User className="w-4 h-4" strokeWidth={1.75} />
        {session.agentName}
      </span>
      {session.panelName && (
        <span className="inline-flex items-center gap-1.5">
          <Layers className="w-4 h-4" strokeWidth={1.75} />
          {session.panelName}
        </span>
      )}
      {duracao && (
        <span className="inline-flex items-center gap-1.5">
          <Clock className="w-4 h-4" strokeWidth={1.75} />
          {duracao}
        </span>
      )}
    </div>
  );

  const notaEChip = (
    <div className="flex items-center gap-2.5">
      <span className="text-[28px] leading-9 font-medium">{fmtNota(session.notaConversa)}</span>
      <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-xs font-medium ${TONE_CHIP[status.tone]}`}>{status.label}</span>
    </div>
  );

  const avaliacao = (
    <div className="min-w-0 p-5 sm:p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">Resumo</span>
        <p className="leading-[22px]">{session.resumo1Linha ? <TextoAnonimo texto={session.resumo1Linha} /> : "Resumo indisponível."}</p>
      </div>
      <div className="flex flex-col">
        <span className="text-base font-medium pb-2">Avaliação por critério</span>
        {CRITERIOS.map((c) => {
          const nota = session.scores[c.key];
          const ev = session.evidencias?.[c.key === "proximoPasso" ? "proximo_passo" : c.key];
          return (
            <div key={c.key} className="flex flex-col gap-1 py-3 border-b border-divider last:border-b-0">
              <div className="flex justify-between">
                <span className="font-medium">{c.label}</span>
                <span className="font-medium">{fmtNota(nota)}</span>
              </div>
              {ev && (
                <span className="text-[13px] text-muted">
                  “<TextoAnonimo texto={ev} />”
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const mensagens = (
    <div className="min-w-0 p-5 sm:p-6 flex flex-col gap-3 lg:min-h-0 lg:h-full">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base font-medium">Mensagens</span>
        <span className="text-xs text-muted">Nome e telefone do cliente ficam ocultos</span>
      </div>
      <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto bg-page rounded-card p-4 flex flex-col gap-3.5">
        {carregando && session.messages.length === 0 && <p className="text-[13px] text-muted">{MSG.carregando}</p>}
        {session.messages.map((m) => {
          const cliente = m.sender === "cliente";
          const auto = AUTOMATED_ORIGINS.has(m.origin);
          return (
            <div key={m.id} className={`flex flex-col gap-1 max-w-[85%] sm:max-w-[80%] ${cliente ? "self-start" : "self-end"}`}>
              <div className="flex items-center justify-between gap-4 text-xs text-muted">
                {auto ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5" strokeWidth={1.75} />
                    Mensagem automática, {origemAutomatica(m.origin)}
                  </span>
                ) : cliente ? (
                  <span>Cliente</span>
                ) : (
                  <span className="text-primary-ink font-medium">{session.agentName}</span>
                )}
                <span>{m.timestamp}</span>
              </div>
              <div
                className={`px-3.5 py-2.5 leading-[21px] whitespace-pre-wrap break-words ${
                  cliente
                    ? "bg-surface border border-line rounded-[4px_16px_16px_16px]"
                    : auto
                      ? "bg-subtle border border-divider rounded-[16px_4px_16px_16px]"
                      : "bg-primary-soft rounded-[16px_4px_16px_16px]"
                }`}
              >
                <TextoAnonimo texto={m.text} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const botaoFechar = (
    <button
      ref={fechar}
      type="button"
      onClick={onClose}
      aria-label="Fechar"
      className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-muted hover:bg-subtle focus-visible:outline-2 outline-primary"
    >
      <X className="w-[22px] h-[22px]" strokeWidth={1.75} />
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/45 flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Detalhe da conversa"
    >
      <div
        className="bg-surface rounded-2xl shadow-menu w-full max-w-[1100px] max-h-[94vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* No celular: a data e o fechar numa linha, a nota embaixo e depois os detalhes. */}
        <div className="flex flex-col gap-2 pl-5 pr-2 sm:px-6 py-3 sm:py-5 border-b border-divider">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg sm:text-xl font-medium">Conversa de {session.startAt ? fmtDia(session.startAt) : "data não informada"}</h2>
            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden sm:block">{notaEChip}</div>
              {botaoFechar}
            </div>
          </div>
          <div className="sm:hidden pr-3">{notaEChip}</div>
          <div className="pr-3 sm:pr-0">{detalhes}</div>
        </div>

        <div role="tablist" aria-label="Partes da conversa" className="lg:hidden flex border-b border-divider">
          {(
            [
              ["avaliacao", "Avaliação"],
              ["mensagens", "Mensagens"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={aba === id}
              onClick={() => setAba(id)}
              className={`flex-1 h-12 font-medium border-b-[3px] focus-visible:outline-2 focus-visible:-outline-offset-2 outline-primary ${
                aba === id ? "text-primary border-primary" : "text-muted border-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">
          <div className={`${aba === "avaliacao" ? "" : "hidden"} lg:block lg:flex-[5_1_0] min-w-0 lg:border-r border-divider lg:overflow-y-auto`}>
            {avaliacao}
          </div>
          <div className={`${aba === "mensagens" ? "" : "hidden"} lg:flex lg:flex-col lg:flex-[7_1_0] min-w-0 lg:min-h-0`}>{mensagens}</div>
        </div>
      </div>
    </div>
  );
};
