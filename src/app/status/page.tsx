"use client";

import React, { useEffect, useState } from "react";

/** Página técnica (sem link no menu): estado dos jobs de sincronização e análise. Só para a equipe de suporte. */
export default function StatusPage() {
  const [pipeline, setPipeline] = useState<any>(null);

  useEffect(() => {
    fetch("/api/pipeline")
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
    </main>
  );
}
