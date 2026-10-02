"use client";

import React, { useEffect, useState } from "react";
import type { ReportItem, SessionDetail } from "@/lib/types";
import type { TrendPoint } from "@/components/TrendChart";
import { ConversationModal } from "@/components/ConversationModal";
import { AppHeader, type TabId } from "@/components/layout/AppHeader";
import { ultimos30Dias, type Intervalo } from "@/components/layout/PeriodPicker";
import { OverviewTab } from "@/components/tabs/OverviewTab";
import { AgentsTab } from "@/components/tabs/AgentsTab";
import { ConversationsTab } from "@/components/tabs/ConversationsTab";
import { fmtAtualizado } from "@/lib/format";
import { MSG, PERIODO, type TipoPeriodo } from "@/lib/labels";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export default function DashboardPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [tab, setTab] = useState<TabId>("visao");
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [periods, setPeriods] = useState<Array<{ start: string; end: string }>>([]);
  const [atualizado, setAtualizado] = useState<string | null>(null);
  const [history, setHistory] = useState<TrendPoint[]>([]);

  // Período: semana e mês publicados (início ISO; "" = o mais recente) ou um intervalo livre. Vem do endereço, para o link valer.
  const [tipo, setTipo] = useState<TipoPeriodo>("semana");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [intervalo, setIntervalo] = useState<Intervalo | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const de = p.get("de");
    const ate = p.get("ate");
    if (de && ate && DIA.test(de) && DIA.test(ate)) {
      setTipo("livre");
      setIntervalo({ de, ate });
    } else {
      if (p.get("tipo") === "mes") setTipo("mes");
      setSelectedPeriod(p.get("period") ?? "");
    }
    setPronto(true);
  }, []);

  useEffect(() => {
    if (!pronto) return;
    const p = new URLSearchParams();
    if (tipo === "livre" && intervalo) {
      p.set("de", intervalo.de);
      p.set("ate", intervalo.ate);
    } else {
      if (tipo === "mes") p.set("tipo", "mes");
      if (selectedPeriod) p.set("period", selectedPeriod);
    }
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [pronto, tipo, selectedPeriod, intervalo]);

  const livre = tipo === "livre" && intervalo !== null;
  // O período como a API o entende (relatórios, conversas).
  const baseQuery = livre
    ? `de=${intervalo!.de}&ate=${intervalo!.ate}`
    : `tipo=${tipo === "livre" ? "semana" : tipo}${selectedPeriod ? `&period=${encodeURIComponent(selectedPeriod)}` : ""}`;

  const onTipo = (t: TipoPeriodo) => {
    if (t === tipo) return;
    setTipo(t);
    setSelectedPeriod("");
    if (t === "livre" && !intervalo) setIntervalo(ultimos30Dias());
  };

  useEffect(() => {
    if (!pronto || tipo === "livre") return;
    let ativo = true;
    fetch(`/api/reports/periods?tipo=${tipo}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => ativo && setPeriods(d))
      .catch(() => ativo && setPeriods([]));
    return () => {
      ativo = false;
    };
  }, [pronto, tipo]);

  useEffect(() => {
    if (!pronto) return;
    let ativo = true;
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [repRes, pipeRes] = await Promise.all([
          fetch(livre ? `/api/reports/live?${baseQuery}` : `/api/reports?${baseQuery}`),
          fetch("/api/pipeline"),
        ]);
        if (!ativo) return;

        if (!repRes.ok) {
          // Intervalo livre com data inválida: o servidor explica o motivo em português.
          const body = repRes.status === 400 ? await repRes.json().catch(() => null) : null;
          setError(body?.error ?? MSG.erroDados);
          setReports([]);
          return;
        }

        const repData: ReportItem[] = await repRes.json();
        const pipe = await pipeRes.json().catch(() => null);
        if (!ativo) return;
        const job = (pipe?.recentJobs ?? []).find((j: any) => j.status === "completed" && j.finishedAt);
        setAtualizado(job ? fmtAtualizado(job.finishedAt) : null);

        setReports(repData);
        const general = repData.find((r) => r.scopeType === "geral");
        setSelectedReportId((general ?? repData[0])?.id ?? "");
      } catch (err) {
        console.error("Erro ao carregar dados:", err);
        if (ativo) setError(MSG.erroDados);
      } finally {
        if (ativo) setLoading(false);
      }
    }

    loadData();
    return () => {
      ativo = false;
    };
  }, [pronto, baseQuery, livre]);

  const currentReport = reports.find((r) => r.id === selectedReportId) || reports[0];
  const tipoAtual: TipoPeriodo = currentReport?.granularity ?? tipo;

  // O gráfico de evolução mostra períodos publicados: meses no relatório mensal, semanas nos demais.
  useEffect(() => {
    if (!currentReport) {
      setHistory([]);
      return;
    }
    let ativo = true;
    const unidade = currentReport.granularity === "mes" ? "mes" : "semana";
    fetch(`/api/reports/history?scopeType=${currentReport.scopeType}&scopeId=${encodeURIComponent(currentReport.scopeId)}&tipo=${unidade}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => ativo && setHistory(d))
      .catch(() => ativo && setHistory([]));
    return () => {
      ativo = false;
    };
  }, [currentReport?.scopeType, currentReport?.scopeId, currentReport?.granularity]);

  const general = reports.find((r) => r.scopeType === "geral");
  const scopeReports = reports.filter((r) => r.scopeType !== "agente");
  const agentReports = reports.filter((r) => r.scopeType === "agente");

  const goTab = (t: TabId) => {
    // Voltar para a aba Visão geral a partir da ficha de um atendente leva à visão geral da operação.
    if (t === "visao" && currentReport?.scopeType === "agente" && general) setSelectedReportId(general.id);
    setTab(t);
  };

  const openWeek = (start: string) => {
    setTipo("semana");
    setSelectedPeriod(start);
  };

  const openSessionById = async (id: string) => {
    try {
      const r = await fetch(`/api/sessions?id=${encodeURIComponent(id)}`);
      if (!r.ok) return;
      const d = await r.json();
      if (d.sessions?.[0]) setSelectedSession(d.sessions[0]);
    } catch {
      /* a conversa simplesmente não abre */
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        tab={tab}
        onTab={goTab}
        tipo={tipo}
        onTipo={onTipo}
        periods={periods}
        selectedPeriod={selectedPeriod}
        onPeriod={setSelectedPeriod}
        intervalo={intervalo}
        onIntervalo={setIntervalo}
        atualizado={atualizado}
      />

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 pt-7 pb-14">
        {loading ? (
          <p className="text-muted">{MSG.carregando}</p>
        ) : error ? (
          <div className="p-4 rounded-card bg-bad-soft text-bad text-[13px]">{error}</div>
        ) : !currentReport ? (
          <div className="p-4 rounded-card bg-subtle text-[13px] text-ink-2">{PERIODO[tipo].semRelatorio}</div>
        ) : (
          <>
            {tab === "visao" && (
              <OverviewTab
                report={currentReport}
                scopeReports={scopeReports}
                history={history}
                onSelect={setSelectedReportId}
                onBackToAgents={() => setTab("atendentes")}
                onOpenWeek={openWeek}
                onOpenSession={openSessionById}
              />
            )}
            {tab === "atendentes" && (
              <AgentsTab
                agents={agentReports}
                tipo={tipoAtual}
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
                tipo={tipoAtual}
                periodStart={currentReport.periodStart}
                periodEnd={currentReport.periodEnd}
                baseQuery={baseQuery}
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
