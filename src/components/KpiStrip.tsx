import React from "react";
import type { KpiMetrics } from "@/lib/types";
import { Clock, CheckCircle2, AlertTriangle, TrendingUp, RefreshCw, Zap } from "lucide-react";

interface KpiStripProps {
  metrics: KpiMetrics;
}

export const KpiStrip: React.FC<KpiStripProps> = ({ metrics }) => {
  const isHighVacuum = metrics.semRespostaPct > 30;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {/* TMR Médio */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">TMR Médio</span>
          <Clock className="w-3.5 h-3.5 text-blue-500" />
        </div>
        <div className="text-xl font-bold text-slate-900">{metrics.tmrMedioFormatado || "N/D"}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">1ª resposta humana</div>
      </div>

      {/* FTR Mediana */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">FTR Mediana</span>
          <Zap className="w-3.5 h-3.5 text-amber-500" />
        </div>
        <div className="text-xl font-bold text-slate-900">{metrics.ftrMedianaFormatada || "N/D"}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">Tempo resolução</div>
      </div>

      {/* Resp. Cliente */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Resp. Cliente</span>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        </div>
        <div className="text-xl font-bold text-slate-900">{metrics.respClientePct.toFixed(1)}%</div>
        <div className="text-[11px] text-slate-400 mt-0.5">Respondidos loja</div>
      </div>

      {/* Sem Resposta */}
      <div className={`p-3.5 rounded-xl border shadow-xs flex flex-col justify-between transition-colors ${
        isHighVacuum
          ? "bg-rose-50/50 border-rose-200"
          : "bg-white border-slate-200/80 hover:border-slate-300"
      }`}>
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Sem Resposta</span>
          <AlertTriangle className={`w-3.5 h-3.5 ${isHighVacuum ? "text-rose-500" : "text-slate-400"}`} />
        </div>
        <div className={`text-xl font-bold ${isHighVacuum ? "text-rose-600" : "text-slate-900"}`}>
          {metrics.semRespostaPct.toFixed(1)}%
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">Cliente no vácuo</div>
      </div>

      {/* Fechamento CRM */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Fechamento</span>
          <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
        </div>
        <div className="text-xl font-bold text-slate-900">
          {metrics.taxaFechamentoPct !== null ? `${metrics.taxaFechamentoPct.toFixed(1)}%` : "N/D"}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">Cards WON / Total</div>
      </div>

      {/* Reativação */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider">Reativação</span>
          <RefreshCw className="w-3.5 h-3.5 text-cyan-500" />
        </div>
        <div className="text-xl font-bold text-slate-900">{metrics.reativacaoPct.toFixed(1)}%</div>
        <div className="text-[11px] text-slate-400 mt-0.5">Retomada ≥ 24h</div>
      </div>
    </div>
  );
};
