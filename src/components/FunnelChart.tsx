import React from "react";
import type { FunnelData } from "@/lib/types";
import { Filter, ThumbsUp, ThumbsDown, Clock } from "lucide-react";

interface FunnelChartProps {
  funil?: FunnelData | null;
}

export const FunnelChart: React.FC<FunnelChartProps> = ({ funil }) => {
  if (!funil) return null;

  const total = funil.open + funil.won + funil.lost;
  const wonPct = total > 0 ? ((funil.won / total) * 100).toFixed(1) : "0.0";
  const lostPct = total > 0 ? ((funil.lost / total) * 100).toFixed(1) : "0.0";
  const openPct = total > 0 ? ((funil.open / total) * 100).toFixed(1) : "0.0";

  const etapasEntries = Object.entries(funil.etapas || {});
  const lostReasonsEntries = Object.entries(funil.lostReasons || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 mb-6">
      <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">
            Funil do Painel CRM & Desfechos
          </h2>
        </div>
        <span className="text-xs text-slate-500 font-medium">
          Total de <strong>{total}</strong> cards no período
        </span>
      </div>

      {/* Cards Status Breakdown */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Ganhos (WON)</div>
            <div className="text-2xl font-bold text-emerald-950 mt-0.5">{funil.won}</div>
            <div className="text-[11px] text-emerald-700">{wonPct}% conversão</div>
          </div>
          <ThumbsUp className="w-6 h-6 text-emerald-500 opacity-80" />
        </div>

        <div className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-100 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider">Perdidos (LOST)</div>
            <div className="text-2xl font-bold text-rose-950 mt-0.5">{funil.lost}</div>
            <div className="text-[11px] text-rose-700">{lostPct}% perda</div>
          </div>
          <ThumbsDown className="w-6 h-6 text-rose-500 opacity-80" />
        </div>

        <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider">Em Aberto (OPEN)</div>
            <div className="text-2xl font-bold text-blue-950 mt-0.5">{funil.open}</div>
            <div className="text-[11px] text-blue-700">{openPct}% em negociação</div>
          </div>
          <Clock className="w-6 h-6 text-blue-500 opacity-80" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Etapas */}
        <div>
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            Volume por Etapa do Pipeline
          </div>
          <div className="space-y-2.5">
            {etapasEntries.length === 0 ? (
              <div className="text-xs text-slate-400 italic">Nenhuma etapa com cards.</div>
            ) : (
              etapasEntries.map(([etapa, count]) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={etapa}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">{etapa}</span>
                      <span className="font-semibold text-slate-900">{count} cards ({pct}%)</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Motivos de Perda */}
        <div>
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
            Principais Motivos de Perda (LOST)
          </div>
          <div className="space-y-2">
            {lostReasonsEntries.length === 0 ? (
              <div className="text-xs text-slate-400 italic">Nenhum motivo de perda registrado.</div>
            ) : (
              lostReasonsEntries.map(([reason, count]) => (
                <div
                  key={reason}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                >
                  <span className="text-slate-700 font-medium">{reason}</span>
                  <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                    {count} {count === 1 ? "card" : "cards"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
