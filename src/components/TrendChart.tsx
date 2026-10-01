import React from "react";
import { fmtDiaMes, fmtNota } from "@/lib/format";

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

/** Um ponto por semana, com o valor oficial publicado. */
export const TrendChart: React.FC<TrendChartProps> = ({ points, highlightStart }) => {
  if (points.length < 2) {
    return <p className="text-[13px] text-muted">O gráfico aparece a partir da 2ª semana publicada.</p>;
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
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Nota por semana">
      {[0, 5, 10].map((g) => (
        <g key={g}>
          <line x1={padX} x2={W - padX} y1={y(g)} y2={y(g)} stroke="var(--color-divider)" strokeWidth="1" />
          <text x={2} y={y(g) + 3} fontSize="8" fill="var(--color-muted)">{g}</text>
        </g>
      ))}
      <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinejoin="round" />
      {valid.map(({ p, i }) => (
        <g key={p.periodStart}>
          <circle
            cx={x(i)}
            cy={y(p.notaGeral!)}
            r={p.periodStart === highlightStart ? 5 : 3.5}
            fill={p.preliminar ? "#fff" : "var(--color-primary)"}
            stroke="var(--color-primary)"
            strokeWidth="2"
          >
            <title>{`Semana de ${fmtDiaMes(p.periodStart)} a ${fmtDiaMes(p.periodEnd)}: nota ${fmtNota(p.notaGeral)} (${p.n} conversas${p.preliminar ? ", amostra pequena" : ""})`}</title>
          </circle>
          <text x={x(i)} y={H - 2} fontSize="8" textAnchor="middle" fill="var(--color-muted)">{fmtDiaMes(p.periodStart)}</text>
        </g>
      ))}
    </svg>
  );
};
