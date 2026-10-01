import React from "react";
import type { KpiMetrics } from "@/lib/types";
import { SEM_RESPOSTA_ALERT_PCT } from "@/lib/thresholds";
import { fmtDuracao, fmtPct } from "@/lib/format";

interface KpiStripProps {
  metrics: KpiMetrics;
}

const Card: React.FC<{ label: string; value: string; hint?: React.ReactNode; alert?: boolean; className?: string }> = ({
  label,
  value,
  hint,
  alert,
  className = "",
}) => (
  <div className={`bg-surface border border-line rounded-card px-5 py-4 flex flex-col gap-1 ${className}`}>
    <span className="text-[13px] leading-5 font-medium text-muted">{label}</span>
    <span className={`text-[28px] leading-9 font-medium ${alert ? "text-bad" : ""}`}>{value}</span>
    {hint}
  </div>
);

const Legenda: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-xs text-muted">{children}</span>
);

export const KpiStrip: React.FC<KpiStripProps> = ({ metrics }) => {
  const alto = (metrics.semRespostaPct ?? 0) > SEM_RESPOSTA_ALERT_PCT;
  const tmr = metrics.tmrMedioSegundos !== undefined ? fmtDuracao(metrics.tmrMedioSegundos) : metrics.tmrMedioFormatado || "—";
  const ftr = metrics.ftrMedianaSegundos !== undefined ? fmtDuracao(metrics.ftrMedianaSegundos) : metrics.ftrMedianaFormatada || "—";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <Card label="Tempo da 1ª resposta" value={tmr} hint={<Legenda>Média até uma pessoa responder</Legenda>} />
      <Card label="Tempo até resolver" value={ftr} hint={<Legenda>Tempo típico do início ao fim</Legenda>} />
      <Card
        label="Sem resposta"
        value={fmtPct(metrics.semRespostaPct)}
        alert={alto}
        hint={
          alto ? (
            <span className="self-start inline-flex items-center h-5 px-2 rounded-full bg-bad-soft text-bad text-xs font-medium">
              Acima do limite de {SEM_RESPOSTA_ALERT_PCT}%
            </span>
          ) : (
            <Legenda>Clientes que não foram respondidos</Legenda>
          )
        }
      />
      <Card label="Taxa de fechamento" value={fmtPct(metrics.taxaFechamentoPct)} hint={<Legenda>Negócios ganhos no CRM</Legenda>} />
      <Card
        label="Conversas retomadas"
        value={fmtPct(metrics.reativacaoPct)}
        hint={<Legenda>Cliente voltou após 24h ou mais</Legenda>}
        className="col-span-2 lg:col-span-1"
      />
    </div>
  );
};
