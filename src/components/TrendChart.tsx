import React from "react";

export interface TrendPoint {
  periodStart: string;
  periodEnd: string;
  notaGeral: number | null;
  n: number;
  preliminar?: boolean;
}

interface TrendChartProps {
  points: TrendPoint[];
  highlightStart?: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** Um ponto por semana, com o valor oficial publicado. */
export const TrendChart: React.FC<TrendChartProps> = ({ points, highlightStart }) => {
  if (points.length < 2) {
    return <p className="text-xs text-slate-400 italic">Histórico semanal aparece a partir da 2ª semana publicada.</p>;
  }

  const W = 320;
  const H = 110;
  const padX = 16;
  const padY = 14;
  const x = (i: number) => padX + (i * (W - 2 * padX)) / (points.length - 1);
  const y = (v: number) => padY + ((10 - v) * (H - 2 * padY)) / 10;

  const valid = points.map((p, i) => ({ p, i })).filter(({ p }) => p.notaGeral != null);
  const path = valid.map(({ p, i }, k) => `${k === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.notaGeral!).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Nota geral por semana">
      {[0, 5, 10].map((g) => (
        <g key={g}>
          <line x1={padX} x2={W - padX} y1={y(g)} y2={y(g)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={2} y={y(g) + 3} fontSize="8" fill="#94a3b8">{g}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />
      {valid.map(({ p, i }) => (
        <g key={p.periodStart}>
          <circle
            cx={x(i)}
            cy={y(p.notaGeral!)}
            r={p.periodStart === highlightStart ? 5 : 3.5}
            fill={p.preliminar ? "#fff" : "#2563eb"}
            stroke="#2563eb"
            strokeWidth="2"
          >
            <title>{`${day(p.periodStart)} a ${day(p.periodEnd)}: ${p.notaGeral!.toFixed(1)} (${p.n} conversas${p.preliminar ? ", preliminar" : ""})`}</title>
          </circle>
          <text x={x(i)} y={H - 2} fontSize="8" textAnchor="middle" fill="#64748b">{day(p.periodStart)}</text>
        </g>
      ))}
    </svg>
  );
};
