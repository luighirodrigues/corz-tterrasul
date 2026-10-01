import React from "react";
import type { CriteriaScores } from "@/lib/types";
import { CRITERIOS, META_NOTA } from "@/lib/labels";
import { fmtNota } from "@/lib/format";

interface CriteriaBarsProps {
  scores: CriteriaScores;
}

export const CriteriaBars: React.FC<CriteriaBarsProps> = ({ scores }) => (
  <div className="flex flex-col gap-[22px]">
    {CRITERIOS.map((c) => {
      const val = scores[c.key];
      const pct = val == null ? 0 : Math.min(100, Math.max(0, val * 10));
      return (
        <div key={c.key} className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col">
              <span className="font-medium">{c.label}</span>
              <span className="text-xs text-muted">{c.description}</span>
            </div>
            <span className="text-base font-medium">{fmtNota(val)}</span>
          </div>
          <div className="relative h-2 rounded bg-divider">
            <div className="h-2 rounded bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
            <div
              className="absolute -top-1 w-0.5 h-4 rounded-sm bg-ink-2"
              style={{ left: `${META_NOTA * 10}%` }}
              aria-hidden
            />
          </div>
        </div>
      );
    })}
  </div>
);
