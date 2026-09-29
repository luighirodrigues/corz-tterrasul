import React from "react";
import type { SessionDetail } from "@/lib/types";
import { X, Clock, User, Phone, Bot, CheckCircle, ShieldAlert } from "lucide-react";

interface ConversationModalProps {
  session: SessionDetail | null;
  onClose: () => void;
}

export const ConversationModal: React.FC<ConversationModalProps> = ({ session, onClose }) => {
  if (!session) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
              {session.agentName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">
                  Conversa #{session.number || session.id.slice(0, 8)}
                </h3>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                  Nota {session.notaConversa.toFixed(1)}/10
                </span>
                <span className="text-xs text-slate-400">• {session.panelName}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> {session.agentName}
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" /> {session.contactPhone}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {session.startAt} ({session.durationMinutes} min)
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Split into AI Rubric & Transcript */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: AI Assessment (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Resumo em 1 Linha (IA)
              </span>
              <p className="text-xs font-medium text-slate-800 leading-relaxed">
                "{session.resumo1Linha}"
              </p>
            </div>

            <div>
              <span className="text-xs font-bold text-slate-900 block mb-2.5">
                Avaliação dos 5 Critérios & Evidências
              </span>

              <div className="space-y-2.5">
                {[
                  { label: "Pouco Atrito", score: session.scores.atrito, key: "atrito" },
                  { label: "Solução Clara", score: session.scores.solucao, key: "solucao" },
                  { label: "Necessidade", score: session.scores.necessidade, key: "necessidade" },
                  { label: "Próximo Passo", score: session.scores.proximoPasso, key: "proximo_passo" },
                  { label: "Resolvida", score: session.scores.resolvida, key: "resolvida" },
                ].map((crit) => {
                  const ev = session.evidencias?.[crit.key];
                  return (
                    <div key={crit.key} className="p-3 rounded-lg border border-slate-100 bg-white shadow-2xs">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700">{crit.label}</span>
                        <span className="font-bold text-slate-900">
                          {crit.score !== null ? `${crit.score}/10` : "N/A"}
                        </span>
                      </div>
                      {ev && (
                        <p className="text-[11px] text-slate-500 italic mt-1 leading-snug">
                          "{ev}"
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Message Transcript (7 cols) */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="text-xs font-bold text-slate-900 mb-3 flex items-center justify-between">
              <span>Transcrição Anonimizada do WhatsApp</span>
              <span className="text-[11px] text-slate-400 font-normal">
                {session.messages.length} mensagens
              </span>
            </div>

            <div className="space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex-1 overflow-y-auto max-h-[460px]">
              {session.messages.map((m) => {
                const isClient = m.sender === "cliente";
                const isBot = m.origin === "BOT";

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isClient ? "items-start" : "items-end"}`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-0.5 px-1">
                      {isBot ? (
                        <span className="flex items-center gap-1 font-semibold text-amber-600">
                          <Bot className="w-3 h-3" /> [BOT AUTOMATIZADO]
                        </span>
                      ) : isClient ? (
                        <span>Cliente</span>
                      ) : (
                        <span className="font-medium text-blue-600">{session.agentName}</span>
                      )}
                      <span>• {m.timestamp}</span>
                    </div>

                    <div
                      className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                        isClient
                          ? "bg-white text-slate-800 rounded-tl-xs border border-slate-200/80 shadow-2xs"
                          : isBot
                          ? "bg-amber-50 text-amber-900 rounded-tr-xs border border-amber-200/60"
                          : "bg-blue-600 text-white rounded-tr-xs shadow-xs"
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
