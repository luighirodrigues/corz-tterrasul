import React from "react";
import type { AiInsight } from "@/lib/types";
import { Sparkles, CheckCircle2, Lightbulb, MessageSquareQuote } from "lucide-react";

interface AiInsightsBlockProps {
  pontosFortes: AiInsight[] | null;
  oportunidades: AiInsight[] | null;
  model?: string | null;
  promptVersion?: string | null;
}

export const AiInsightsBlock: React.FC<AiInsightsBlockProps> = ({
  pontosFortes,
  oportunidades,
  model,
  promptVersion,
}) => {
  if (pontosFortes === null && oportunidades === null) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 mb-6 text-sm text-slate-500">
        Síntese de IA indisponível nesta leva.
      </div>
    );
  }
  pontosFortes = pontosFortes ?? [];
  oportunidades = oportunidades ?? [];
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 mb-6">
      <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-3">
        <Sparkles className="w-5 h-5 text-indigo-600" />
        <h2 className="text-base font-bold text-slate-900">
          Síntese de Inteligência Artificial & Coaching Operacional
        </h2>
        <span className="ml-auto text-xs font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
          Estágio 2 • {model ?? "modelo N/D"}{promptVersion ? ` • ${promptVersion}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pontos Fortes */}
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-800 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Pontos Fortes Comprovados</span>
          </div>

          <div className="space-y-3">
            {pontosFortes.length === 0 ? (
              <div className="text-xs text-slate-400 italic">Nenhum ponto forte registrado na amostragem.</div>
            ) : (
              pontosFortes.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 text-xs text-emerald-950 flex flex-col gap-1.5"
                >
                  <div className="flex items-center">
                    <span className="font-bold text-[10px] uppercase tracking-wider bg-emerald-200/70 text-emerald-800 px-2 py-0.5 rounded-full">
                      {item.n_casos} {item.n_casos === 1 ? "conversa" : "conversas"}
                    </span>
                  </div>
                  <p className="leading-relaxed font-medium">{item.texto}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Oportunidades de Melhoria */}
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-amber-800 mb-3">
            <Lightbulb className="w-4 h-4 text-amber-600" />
            <span>Oportunidades & Scripts de Coaching</span>
          </div>

          <div className="space-y-3">
            {oportunidades.length === 0 ? (
              <div className="text-xs text-slate-400 italic">Nenhuma oportunidade crítica identificada.</div>
            ) : (
              oportunidades.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-100 text-xs text-amber-950 flex flex-col gap-2"
                >
                  <div className="flex items-center">
                    <span className="font-bold text-[10px] uppercase tracking-wider bg-amber-200/70 text-amber-800 px-2 py-0.5 rounded-full">
                      {item.n_casos} {item.n_casos === 1 ? "conversa" : "conversas"}
                    </span>
                  </div>
                  <p className="leading-relaxed font-medium">{item.texto}</p>

                  {item.script_sugerido && (
                    <div className="mt-1 p-2.5 bg-white/90 rounded-lg border-l-3 border-amber-500 text-[11px] text-slate-700 shadow-2xs">
                      <div className="flex items-center gap-1.5 text-amber-800 font-semibold mb-1">
                        <MessageSquareQuote className="w-3.5 h-3.5" />
                        <span>Script Recomendado:</span>
                      </div>
                      <span className="italic">"{item.script_sugerido}"</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
