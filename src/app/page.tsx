"use client";

import React, { useEffect, useState } from "react";
import type { ReportItem, SessionDetail } from "@/lib/types";
import type { TrendPoint } from "@/components/TrendChart";
import { ConversationModal } from "@/components/ConversationModal";
import { AppHeader, type TabId } from "@/components/layout/AppHeader";
import { OverviewTab } from "@/components/tabs/OverviewTab";
import { AgentsTab } from "@/components/tabs/AgentsTab";
import { ConversationsTab } from "@/components/tabs/ConversationsTab";
import { fmtAtualizado } from "@/lib/format";
import { MSG } from "@/lib/labels";

export default function DashboardPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [tab, setTab] = useState<TabId>("visao");
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [periods, setPeriods] = useState<Array<{ start: string; end: string }>>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [atualizado, setAtualizado] = useState<string | null>(null);
  const [history, setHistory] = useState<TrendPoint[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const q = selectedPeriod ? `?period=${encodeURIComponent(selectedPeriod)}` : "";
        const [repRes, sessRes, perRes, pipeRes] = await Promise.all([
          fetch(`/api/reports${q}`),
          fetch(`/api/sessions${q}`),
          fetch("/api/reports/periods"),
          fetch("/api/pipeline"),
        ]);

        if (!repRes.ok || !sessRes.ok) {
          setError(MSG.erroDados);
          setReports([]);
          setSessions([]);
          return;
        }

        const repData: ReportItem[] = await repRes.json();
        setSessions(await sessRes.json());
        if (perRes.ok) setPeriods(await perRes.json());

        const pipe = await pipeRes.json().catch(() => null);
        const job = (pipe?.recentJobs ?? []).find((j: any) => j.status === "completed" && j.finishedAt);
        setAtualizado(job ? fmtAtualizado(job.finishedAt) : null);

        setReports(repData);
        const general = repData.find((r) => r.scopeType === "geral");
        setSelectedReportId((general ?? repData[0])?.id ?? "");
      } catch (err) {
        console.error("Erro ao carregar dados:", err);
        setError(MSG.erroDados);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [selectedPeriod]);

  const currentReport = reports.find((r) => r.id === selectedReportId) || reports[0];

  useEffect(() => {
    if (!currentReport) {
      setHistory([]);
      return;
    }
    fetch(`/api/reports/history?scopeType=${currentReport.scopeType}&scopeId=${encodeURIComponent(currentReport.scopeId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [currentReport?.scopeType, currentReport?.scopeId]);

  const general = reports.find((r) => r.scopeType === "geral");
  const scopeReports = reports.filter((r) => r.scopeType !== "agente");
  const agentReports = reports.filter((r) => r.scopeType === "agente");

  const goTab = (t: TabId) => {
    // Voltar para a aba Visão geral a partir da ficha de um atendente leva à visão geral da operação.
    if (t === "visao" && currentReport?.scopeType === "agente" && general) setSelectedReportId(general.id);
    setTab(t);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        tab={tab}
        onTab={goTab}
        periods={periods}
        selectedPeriod={selectedPeriod}
        onPeriod={setSelectedPeriod}
        atualizado={atualizado}
      />

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 pt-7 pb-14">
        {loading ? (
          <p className="text-muted">{MSG.carregando}</p>
        ) : error ? (
          <div className="p-4 rounded-card bg-bad-soft text-bad text-[13px]">{error}</div>
        ) : !currentReport ? (
          <div className="p-4 rounded-card bg-subtle text-[13px] text-ink-2">{MSG.semRelatorio}</div>
        ) : (
          <>
            {tab === "visao" && (
              <OverviewTab
                report={currentReport}
                scopeReports={scopeReports}
                history={history}
                onSelect={setSelectedReportId}
                onBackToAgents={() => setTab("atendentes")}
              />
            )}
            {tab === "atendentes" && (
              <AgentsTab
                agents={agentReports}
                periodStart={currentReport.periodStart}
                periodEnd={currentReport.periodEnd}
                onOpen={(id) => {
                  setSelectedReportId(id);
                  setTab("visao");
                }}
              />
            )}
            {tab === "conversas" && (
              <ConversationsTab
                sessions={sessions}
                periodStart={currentReport.periodStart}
                periodEnd={currentReport.periodEnd}
                onOpen={setSelectedSession}
              />
            )}
          </>
        )}
      </main>

      <ConversationModal session={selectedSession} onClose={() => setSelectedSession(null)} />
    </div>
  );
}
