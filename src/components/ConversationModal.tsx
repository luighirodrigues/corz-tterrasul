"use client";

import React, { useEffect } from "react";
import type { SessionDetail } from "@/lib/types";
import { AUTOMATED_ORIGINS } from "@/domain/message-kind";
import { Bot, Clock, Layers, User, X } from "lucide-react";
import { CRITERIOS, origemAutomatica, scoreStatus, TONE_CHIP } from "@/lib/labels";
import { fmtDuracao, fmtNota } from "@/lib/format";

interface ConversationModalProps {
  session: SessionDetail | null;
  onClose: () => void;
}

export const ConversationModal: React.FC<ConversationModalProps> = ({ session, onClose }) => {
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, onClose]);

  if (!session) return null;
  const status = scoreStatus(session.notaConversa);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/45 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Detalhe da conversa"
    >
      <div
        className="bg-surface rounded-2xl shadow-menu w-full max-w-[1100px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-divider">
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="text-xl font-medium">Conversa de {session.startAt?.slice(0, 10) ?? "data não informada"}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
              <span className="inline-flex items-center gap-1.5"><User className="w-4 h-4" strokeWidth={1.75} />{session.agentName}</span>
              <span className="inline-flex items-center gap-1.5"><Layers className="w-4 h-4" strokeWidth={1.75} />{session.panelName}</span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4" strokeWidth={1.75} />
                {session.durationMinutes == null ? "—" : fmtDuracao(session.durationMinutes * 60)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="text-[28px] leading-9 font-medium">{fmtNota(session.notaConversa)}</span>
              <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-xs font-medium ${TONE_CHIP[status.tone]}`}>{status.label}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="w-11 h-11 rounded-full flex items-center justify-center text-muted hover:bg-subtle"
            >
              <X className="w-[22px] h-[22px]" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">
          <div className="lg:flex-[5_1_0] min-w-0 p-6 border-b lg:border-b-0 lg:border-r border-divider flex flex-col gap-6 lg:overflow-y-auto">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted">Resumo</span>
              <p className="leading-[22px]">{session.resumo1Linha ?? "Resumo indisponível."}</p>
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
                      <span className="font-medium">{nota == null ? "—" : nota}</span>
                    </div>
                    {ev && <span className="text-[13px] text-muted">“{ev}”</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:flex-[7_1_0] min-w-0 p-6 flex flex-col gap-3 lg:min-h-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-medium">Mensagens</span>
              <span className="text-xs text-muted">Nome e telefone do cliente ficam ocultos</span>
            </div>
            <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto bg-page rounded-card p-4 flex flex-col gap-3.5">
              {session.messages.map((m) => {
                const cliente = m.sender === "cliente";
                const auto = AUTOMATED_ORIGINS.has(m.origin);
                return (
                  <div key={m.id} className={`flex flex-col gap-1 ${cliente ? "items-start" : "items-end"}`}>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                      {auto ? (
                        <>
                          <Bot className="w-3.5 h-3.5" strokeWidth={1.75} />
                          Mensagem automática · {origemAutomatica(m.origin)} · {m.timestamp}
                        </>
                      ) : cliente ? (
                        <>Cliente · {m.timestamp}</>
                      ) : (
                        <span className="text-primary-ink font-medium">{session.agentName} · {m.timestamp}</span>
                      )}
                    </span>
                    <div
                      className={`max-w-[80%] px-3.5 py-2.5 leading-[21px] whitespace-pre-wrap break-words ${
                        cliente
                          ? "bg-surface border border-line rounded-[4px_16px_16px_16px]"
                          : auto
                            ? "bg-subtle border border-divider rounded-[16px_4px_16px_16px]"
                            : "bg-primary-soft rounded-[16px_4px_16px_16px]"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
