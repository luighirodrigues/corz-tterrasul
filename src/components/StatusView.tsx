"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { fmtDiaMes, fmtMes } from "@/lib/format";

interface EnvioPeriodo {
  granularity: string;
  periodStart: string;
  enviados: number;
  erros: number;
}
interface EnvioErro {
  id: string;
  email: string;
  motivo: string | null;
  granularity: string;
  periodStart: string;
}

const nomePeriodo = (granularity: string, iso: string) =>
  granularity === "mes" ? `Mês de ${fmtMes(iso)}` : granularity === "dia" ? `Dia ${fmtDiaMes(iso)}` : `Semana de ${fmtDiaMes(iso)}`;

/** Página técnica (sem link no menu): estado dos jobs de sincronização e análise. Só para a equipe de suporte. */
export function StatusView() {
  const [pipeline, setPipeline] = useState<any>(null);

  useEffect(() => {
    apiFetch("/api/pipeline")
      .then((r) => r.json())
      .then(setPipeline)
      .catch(() => setPipeline(null));
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl leading-8 font-medium">Status técnico</h1>
        <span className="text-muted">Execuções recentes dos jobs de sincronização e análise.</span>
      </div>

      <section className="bg-surface border border-line rounded-card p-6 flex flex-col gap-4">
        {!pipeline || pipeline.dbStatus !== "online" ? (
          <p className="text-[13px] text-bad">Banco indisponível: sem status de jobs.</p>
        ) : (
          <>
            <div className="text-[13px] text-ink-2">
              Análises da IA (estágio 1):{" "}
              {Object.entries(pipeline.analyses ?? {})
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ") || "nenhuma"}
            </div>
            {(pipeline.recentJobs ?? []).length === 0 && <p className="text-[13px] text-muted">Nenhum job executado ainda.</p>}
            {(pipeline.recentJobs ?? []).map((j: any) => (
              <div key={j.id} className="p-3.5 rounded-card border border-divider bg-page flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium">{j.jobType}</div>
                  <p className="text-xs text-muted">
                    {j.startedAt ? new Date(j.startedAt).toLocaleString("pt-BR") : "—"}
                    {j.finishedAt ? ` → ${new Date(j.finishedAt).toLocaleString("pt-BR")}` : ""} · {j.itemsSuccess} ok · {j.itemsFailed} falhas
                  </p>
                  {j.errorMessage && <p className="text-xs text-bad">{j.errorMessage}</p>}
                </div>
                <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-subtle text-muted text-xs font-medium">{j.status}</span>
              </div>
            ))}
          </>
        )}
      </section>

      {pipeline?.dbStatus === "online" && pipeline.emails && (
        <section className="bg-surface border border-line rounded-card p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium">Resumos por e-mail</h2>
            <span className="text-[13px] text-muted">
              {pipeline.emails.ligado
                ? "Saem quando o daily, o publish:weekly ou o publish:monthly rodam com --email. Para repetir só o que falhou: pnpm email:resumos."
                : "Envio desligado: configure SMTP_HOST (e as outras variáveis de e-mail) para os resumos saírem."}
            </span>
          </div>
          {(pipeline.emails.periodos as EnvioPeriodo[]).length === 0 ? (
            <p className="text-[13px] text-muted">Nenhum resumo enviado ainda.</p>
          ) : (
            <ul className="divide-y divide-divider">
              {(pipeline.emails.periodos as EnvioPeriodo[]).map((p) => (
                <li key={`${p.granularity}|${p.periodStart}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="font-medium">{nomePeriodo(p.granularity, p.periodStart)}</span>
                  <span className="text-[13px] text-ink-2">
                    {p.enviados} enviado{p.enviados === 1 ? "" : "s"}
                    {p.erros > 0 && <span className="text-bad"> · {p.erros} com erro</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(pipeline.emails.erros as EnvioErro[]).length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-[13px] font-medium text-bad">Erros de envio</h3>
              {(pipeline.emails.erros as EnvioErro[]).map((e) => (
                <div key={e.id} className="p-3 rounded-card bg-bad-soft text-[13px]">
                  <div className="font-medium break-all">
                    {e.email} <span className="font-normal text-ink-2">· {nomePeriodo(e.granularity, e.periodStart)}</span>
                  </div>
                  <p className="text-bad break-words">{e.motivo ?? "Sem detalhe."}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
