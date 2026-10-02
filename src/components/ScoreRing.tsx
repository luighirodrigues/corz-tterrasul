import React from "react";
import { fmtNota } from "@/lib/format";
import { scoreStatus, TONE_FILL } from "@/lib/labels";

interface ScoreRingProps {
  score: number | null;
  size?: number;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({ score, size = 176 }) => {
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const clamped = score == null ? 0 : Math.min(10, Math.max(0, score));
  const offset = circumference * (1 - clamped / 10);
  const { tone } = scoreStatus(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label={`Nota ${fmtNota(score)} de 10`}>
        <circle cx="80" cy="80" r={radius} fill="none" stroke="var(--color-divider)" strokeWidth="12" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={TONE_FILL[tone]}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 80 80)"
          className="transition-all duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-medium" style={{ fontSize: size * 0.25, lineHeight: 1.1 }}>
          {fmtNota(score)}
        </span>
        {size >= 140 && <span className="text-[13px] text-muted">de 10</span>}
      </div>
    </div>
  );
};
