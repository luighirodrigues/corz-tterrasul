import React from "react";

interface HistogramChartProps {
  histogram: number[];
}

export const HistogramChart: React.FC<HistogramChartProps> = ({ histogram }) => {
  const max = Math.max(...histogram, 1);
  const total = histogram.reduce((a, b) => a + b, 0);
  const naMeta = histogram.slice(8).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">Distribuição das notas</span>

      <div className="flex items-end gap-1.5 h-28">
        {histogram.map((count, nota) => (
          <div
            key={nota}
            className="flex-1 h-full flex flex-col justify-end items-center gap-1"
            title={`Nota ${nota}: ${count} ${count === 1 ? "conversa" : "conversas"}`}
          >
            <span className="text-[11px] leading-3 text-muted">{count}</span>
            <div
              className={`w-full rounded-t ${nota >= 8 ? "bg-primary" : "bg-primary-faint"}`}
              style={{ height: `${Math.max(Math.round((count / max) * 86), count > 0 ? 4 : 1)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 border-t border-line pt-1.5">
        {histogram.map((_, nota) => (
          <span key={nota} className="flex-1 text-center text-[11px] text-muted">
            {nota}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-primary" />
          Na meta (8 ou mais)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-primary-faint" />
          Abaixo da meta
        </span>
      </div>
      {total > 0 && (
        <span className="text-[13px] text-muted">
          {naMeta} de {total} conversas atingiram a meta
        </span>
      )}
    </div>
  );
};
