import React from "react";
import type { FunnelData } from "@/lib/types";
import { fmtPct } from "@/lib/format";

interface FunnelChartProps {
  funil?: FunnelData | null;
}

export const FunnelChart: React.FC<FunnelChartProps> = ({ funil }) => {
  if (!funil) return null;

  const total = funil.open + funil.won + funil.lost;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  const etapas = Object.entries(funil.etapas || {}).sort((a, b) => b[1] - a[1]);
  const maxEtapa = Math.max(...etapas.map(([, c]) => c), 1);
  const motivos = Object.entries(funil.lostReasons || {}).sort((a, b) => b[1] - a[1]);
  const foraControle = funil.desconsideradas?.foraDoControle ?? 0;
  const higiene = funil.desconsideradas?.higienizacao ?? 0;

  const linhas = [
    { label: "Ganhos", n: funil.won, cor: "bg-good-fill" },
    { label: "Perdidos", n: funil.lost, cor: "bg-bad-fill" },
    { label: "Em negociação", n: funil.open, cor: "bg-primary" },
  ];

  return (
    <section className="bg-surface border border-line rounded-card p-6 flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-medium">Negócios no CRM</h2>
        <span className="text-[13px] text-muted">{total} {total === 1 ? "negócio" : "negócios"} na semana</span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex h-3 rounded-md overflow-hidden gap-0.5">
          {linhas.map((l) => (
            <div key={l.label} className={l.cor} style={{ width: `${pct(l.n)}%` }} />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {linhas.map((l) => (
            <div key={l.label} className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${l.cor}`} />
                {l.label}
              </span>
              <span>
                <strong className="font-medium">{l.n}</strong>
                <span className="text-muted"> · {fmtPct(Number(pct(l.n).toFixed(1)))}</span>
              </span>
            </div>
          ))}
        </div>
        {(foraControle > 0 || higiene > 0) && (
          <p className="text-xs text-muted">
            Não entram na taxa de fechamento: {foraControle} perdas fora do controle da equipe e {higiene} cadastros duplicados ou de quem já é cliente.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-divider pt-5">
        <div className="flex flex-col gap-3">
          <span className="font-medium">Por etapa</span>
          {etapas.length === 0 ? (
            <span className="text-[13px] text-muted">Nenhuma etapa com negócios.</span>
          ) : (
            etapas.map(([etapa, count]) => (
              <div key={etapa} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[13px]">
                  <span>{etapa}</span>
                  <span className="text-muted">{count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-divider">
                  <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(count / maxEtapa) * 100}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex flex-col gap-3">
          <span className="font-medium">Motivos de perda</span>
          {motivos.length === 0 ? (
            <span className="text-[13px] text-muted">Nenhum motivo de perda registrado.</span>
          ) : (
            motivos.map(([motivo, count]) => (
              <div key={motivo} className="flex justify-between text-[13px] border-b border-divider pb-2">
                <span>{motivo}</span>
                <span className="text-muted">{count}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
