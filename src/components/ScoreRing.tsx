import React from "react";

interface ScoreRingProps {
  score: number;
  totalConversas: number;
  size?: number;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  totalConversas,
  size = 180,
}) => {
  const radius = 70;
  const circumference = 2 * Math.PI * radius; // ~439.8
  const clampedScore = Math.min(10, Math.max(0, score));
  const progress = clampedScore / 10;
  const strokeDashoffset = circumference * (1 - progress);

  let strokeColor = "#16a34a"; // verde
  if (clampedScore < 6.0) {
    strokeColor = "#dc2626"; // vermelho
  } else if (clampedScore < 8.0) {
    strokeColor = "#f59e0b"; // amarelo/laranja
  }

  return (
    <div className="flex flex-col items-center justify-center p-2">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          className="transform -rotate-90"
          width={size}
          height={size}
          viewBox="0 0 160 160"
        >
          {/* Círculo de fundo */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="14"
          />
          {/* Círculo de progresso */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-4xl font-extrabold tracking-tight text-slate-900 leading-none">
            {score.toFixed(1)}
          </span>
          <span className="text-xs font-semibold text-slate-500 mt-1">de 10</span>
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-500 font-medium text-center">
        Baseado em <strong className="text-slate-800">{totalConversas}</strong> conversas finalizadas
      </div>
    </div>
  );
};
