import React from "react";
import type { CriteriaScores } from "@/lib/types";

interface CriteriaBarsProps {
  scores: CriteriaScores;
}

export const CriteriaBars: React.FC<CriteriaBarsProps> = ({ scores }) => {
  const criteriaList = [
    {
      key: "atrito",
      label: "Pouco ou Nenhum Atrito",
      description: "Fluidez na comunicação (10 = zero atrito)",
      score: scores.atrito,
      color: "bg-blue-600",
      textColor: "text-blue-700",
      bgSoft: "bg-blue-50",
    },
    {
      key: "solucao",
      label: "Apresentou Solução Clara",
      description: "Alternativa real para o pedido do cliente",
      score: scores.solucao,
      color: "bg-emerald-600",
      textColor: "text-emerald-700",
      bgSoft: "bg-emerald-50",
    },
    {
      key: "necessidade",
      label: "Entendeu a Necessidade",
      description: "Escuta ativa do que o cliente buscava",
      score: scores.necessidade,
      color: "bg-indigo-600",
      textColor: "text-indigo-700",
      bgSoft: "bg-indigo-50",
    },
    {
      key: "proximoPasso",
      label: "Combinou Próximo Passo",
      description: "Alinhamento explícito de ação futura",
      score: scores.proximoPasso,
      color: "bg-amber-600",
      textColor: "text-amber-700",
      bgSoft: "bg-amber-50",
    },
    {
      key: "resolvida",
      label: "Conversa Concluída / Resolvida",
      description: "Conclusão no diálogo (agendamento, retorno firmado)",
      score: scores.resolvida,
      color: "bg-purple-600",
      textColor: "text-purple-700",
      bgSoft: "bg-purple-50",
    },
  ];

  return (
    <div className="space-y-4">
      {criteriaList.map((crit) => {
        const val = crit.score ?? 0;
        const pct = Math.min(100, Math.max(0, val * 10));

        return (
          <div key={crit.key} className="group">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div>
                <span className="font-semibold text-slate-800">{crit.label}</span>
                <span className="hidden sm:inline-block ml-2 text-[11px] text-slate-400">
                  • {crit.description}
                </span>
              </div>
              <span className={`font-bold ${crit.textColor}`}>
                {crit.score !== null ? `${crit.score.toFixed(1)}/10` : "N/A"}
              </span>
            </div>

            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${crit.color} rounded-full transition-all duration-700 ease-out`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
