import React from "react";

interface HistogramChartProps {
  histogram: number[];
}

export const HistogramChart: React.FC<HistogramChartProps> = ({ histogram }) => {
  const max = Math.max(...histogram, 1);

  return (
    <div className="pt-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
        Distribuição das Notas (0 a 10)
      </div>

      <div className="flex items-end h-24 gap-1.5 pt-2 border-b border-slate-100">
        {histogram.map((count, noteIndex) => {
          const heightPct = Math.round((count / max) * 100);

          let barColor = "bg-blue-300 hover:bg-blue-600";
          if (noteIndex < 6) {
            barColor = "bg-rose-300 hover:bg-rose-600";
          } else if (noteIndex < 8) {
            barColor = "bg-amber-300 hover:bg-amber-600";
          } else {
            barColor = "bg-emerald-400 hover:bg-emerald-600";
          }

          return (
            <div
              key={noteIndex}
              className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer"
            >
              {/* Tooltip on hover */}
              <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-semibold py-0.5 px-1.5 rounded shadow pointer-events-none whitespace-nowrap z-10">
                Nota {noteIndex}: {count} {count === 1 ? "conversa" : "conversas"}
              </div>

              {/* Bar */}
              <div
                className={`w-full rounded-t-sm transition-all duration-500 ${barColor}`}
                style={{ height: `${Math.max(heightPct, 4)}%` }}
              />

              {/* Label */}
              <span className="text-[10px] text-slate-400 font-medium mt-1">
                {noteIndex}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
