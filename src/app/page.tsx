"use client";

import React, { useState, useEffect } from "react";
import type { ReportItem, SessionDetail, ScopeType } from "@/lib/types";
import { ScoreRing } from "@/components/ScoreRing";
import { KpiStrip } from "@/components/KpiStrip";
import { CriteriaBars } from "@/components/CriteriaBars";
import { HistogramChart } from "@/components/HistogramChart";
import { FunnelChart } from "@/components/FunnelChart";
import { AiInsightsBlock } from "@/components/AiInsightsBlock";
import { ConversationModal } from "@/components/ConversationModal";
import {
  Building2,
  Car,
  Wrench,
  BarChart3,
  Users,
  MessageSquare,
  Activity,
  Calendar,
  Sparkles,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  Search,
  Filter,
} from "lucide-react";

const fmtNota = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1));

export default function DashboardPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"dashboard" | "ranking" | "auditoria" | "pipeline">("dashboard");
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [periods, setPeriods] = useState<Array<{ start: string; end: string }>>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [pipeline, setPipeline] = useState<any>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const q = selectedPeriod ? `?period=${encodeURIComponent(selectedPeriod)}` : "";
        const [repRes, sessRes, perRes, pipeRes] = await Promise.all([
          fetch(`/api/reports${q}`),
          fetch("/api/sessions"),
          fetch("/api/reports/periods"),
          fetch("/api/pipeline"),
        ]);

        if (!repRes.ok || !sessRes.ok) {
          setError("Banco indisponível. Nenhum dado é exibido sem o banco.");
          setReports([]);
          setSessions([]);
          return;
        }

        const repData: ReportItem[] = await repRes.json();
        const sessData: SessionDetail[] = await sessRes.json();
        if (perRes.ok) setPeriods(await perRes.json());
        setPipeline(await pipeRes.json().catch(() => null));

        setReports(repData);
        setSessions(sessData);

        // Selecionar visão geral por padrão
        const general = repData.find((r) => r.scopeType === "geral");
        if (general) {
          setSelectedReportId(general.id);
        } else if (repData.length > 0) {
          setSelectedReportId(repData[0].id);
        }
      } catch (err) {
        console.error("Erro ao carregar dados:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [selectedPeriod]);

  const currentReport = reports.find((r) => r.id === selectedReportId) || reports[0];

  // Grupos de relatórios
  const generalReport = reports.find((r) => r.scopeType === "geral");
  const divisionReports = reports.filter((r) => r.scopeType === "divisao");
  const panelReports = reports.filter((r) => r.scopeType === "painel");
  const agentReports = reports.filter((r) => r.scopeType === "agente");

  // Ranking ordenado
  const sortedAgents = [...agentReports].sort((a, b) => (b.notaGeral ?? -1) - (a.notaGeral ?? -1));

  // Filtragem de conversas na aba de auditoria
  const filteredSessions = sessions.filter((s) => {
    if (!agentFilter) return true;
    return s.agentName.toLowerCase().includes(agentFilter.toLowerCase());
  });

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-500">
        <Activity className="w-8 h-8 animate-spin text-blue-600 mb-3" />
        <p className="text-sm font-medium">Carregando painel de qualidade...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/80 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-xs">
              T
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 tracking-tight text-base">
                  TTERRASUL
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                  Qualidade FLW
                </span>
              </div>
              <span className="text-[11px] text-slate-500 font-medium block">
                Auditoria de Conversas & CRM • Padrão Pry
              </span>
            </div>
          </div>

          {/* Period & Tenant Tag */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="bg-transparent outline-hidden"
                aria-label="Semana"
              >
                <option value="">Última publicada</option>
                {periods.map((p) => (
                  <option key={p.start} value={p.start}>
                    {new Date(p.start).toLocaleDateString("pt-BR")} a {new Date(p.end).toLocaleDateString("pt-BR")}
                  </option>
                ))}
              </select>
            </div>

            <div className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{pipeline?.tenant?.name ?? "—"}</span>
            </div>
          </div>
        </div>

        {/* Sub-header Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1 border-t border-slate-100 overflow-x-auto py-1">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === "dashboard"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Dashboard por Escopo</span>
          </button>

          <button
            onClick={() => setActiveTab("ranking")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === "ranking"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Ranking de Atendentes</span>
            <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">
              {agentReports.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("auditoria")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === "auditoria"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Auditoria de Conversas</span>
            <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 font-bold">
              {sessions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("pipeline")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTab === "pipeline"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Pipeline & Jobs</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ======================================================== */}
        {/* ABA 1: DASHBOARD POR ESCOPO                             */}
        {/* ======================================================== */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">{error}</div>
        )}
        {!error && reports.length === 0 && activeTab !== "pipeline" && (
          <div className="mb-6 p-4 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-600">
            Nenhum relatório publicado.
          </div>
        )}
        {activeTab === "dashboard" && currentReport && (
          <div>
            {/* Scope Selector Ribbon */}
            <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-2xs mb-6 overflow-x-auto flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2">
                Escopo:
              </span>

              {/* Visão Geral */}
              {generalReport && (
                <button
                  onClick={() => setSelectedReportId(generalReport.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    selectedReportId === generalReport.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/60"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Visão Geral</span>
                  <span className="text-[10px] opacity-80">({fmtNota(generalReport.notaGeral)})</span>
                </button>
              )}

              <div className="h-4 w-px bg-slate-200 mx-1"></div>

              {/* Divisões */}
              {divisionReports.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedReportId(d.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    selectedReportId === d.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/60"
                  }`}
                >
                  {d.scopeId === "veiculos" ? <Car className="w-3.5 h-3.5" /> : <Wrench className="w-3.5 h-3.5" />}
                  <span>{d.title.replace("Divisão ", "")}</span>
                  <span className="text-[10px] opacity-80">({fmtNota(d.notaGeral)})</span>
                </button>
              ))}

              <div className="h-4 w-px bg-slate-200 mx-1"></div>

              {/* Painéis CRM */}
              {panelReports.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedReportId(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    selectedReportId === p.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/60"
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>{p.title.replace("Painel CRM - ", "").replace("Painel CRM ", "")}</span>
                  <span className="text-[10px] opacity-80">({fmtNota(p.notaGeral)})</span>
                </button>
              ))}
            </div>

            {/* Title & Preliminary Alert */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  {currentReport.title}
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Janela fechada de <strong>{currentReport.periodStart}</strong> a <strong>{currentReport.periodEnd}</strong>
                </p>
              </div>

              {currentReport.preliminar && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>Amostra preliminar (menos de 10 conversas na janela)</span>
                </div>
              )}
            </div>

            {currentReport.limitacoes && (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <div className="font-bold mb-1">Limitações desta leva</div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {currentReport.limitacoes.split("\n").filter(Boolean).map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 1. KPIs Sintéticos */}
            <KpiStrip metrics={currentReport.sinteticos} />

            {/* 2. Grid Central: Anel de Qualidade + Barras dos 5 Critérios */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
              {/* Left Column: Anel + Histograma (5 cols) */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 mb-1">
                    Índice de Qualidade do Atendimento
                  </h2>
                  <p className="text-xs text-slate-400 mb-4">
                    Média dos 5 critérios analíticos (escala de 0 a 10)
                  </p>

                  <ScoreRing
                    score={currentReport.notaGeral}
                    totalConversas={currentReport.totalConversas}
                  />
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100">
                  <HistogramChart histogram={currentReport.histograma} />
                </div>
              </div>

              {/* Right Column: Barras dos 5 Critérios (7 cols) */}
              <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-sm font-bold text-slate-900">
                      Desempenho nos 5 Critérios Analíticos
                    </h2>
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">
                      Pesos de 20%
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-6">
                    Avaliados conversa por conversa via OpenAI Structured Outputs
                  </p>

                  <CriteriaBars scores={currentReport.medias} />
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Polaridade do Atrito: 10 = Zero Atrito</span>
                  <span className="font-semibold text-slate-700">Meta Operacional: ≥ 8.0</span>
                </div>
              </div>
            </div>

            {/* 3. Funil do CRM (se houver) */}
            {currentReport.funil && <FunnelChart funil={currentReport.funil} />}

            {/* 4. Síntese de IA (Pontos Fortes & Oportunidades) */}
            <AiInsightsBlock
              pontosFortes={currentReport.textoFortes}
              oportunidades={currentReport.textoOps}
              model={currentReport.model}
              promptVersion={currentReport.promptVersionSintese}
            />
          </div>
        )}

        {/* ======================================================== */}
        {/* ABA 2: RANKING DE ATENDENTES                            */}
        {/* ======================================================== */}
        {activeTab === "ranking" && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Ranking de Qualidade por Atendente
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Avaliação individual de cada consultor no período • Janela vigente
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedAgents.map((ag, index) => {
                const medalColors = ["bg-amber-400 text-slate-950", "bg-slate-300 text-slate-900", "bg-amber-600 text-white"];
                const isTop3 = index < 3;

                return (
                  <div
                    key={ag.id}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 hover:border-blue-400 hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                            isTop3 ? medalColors[index] : "bg-slate-100 text-slate-700"
                          }`}>
                            {index + 1}º
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm">
                              {ag.title.replace("Atendente - ", "")}
                            </h3>
                            <span className="text-[11px] text-slate-400">
                              {ag.totalConversas} conversas auditadas
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xl font-black text-slate-900 leading-none">
                            {fmtNota(ag.notaGeral)}
                          </div>
                          <span className="text-[10px] text-slate-400 font-semibold">nota 0-10</span>
                        </div>
                      </div>

                      {/* Small KPI grid */}
                      <div className="grid grid-cols-2 gap-2 my-4 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">TMR Médio</span>
                          <span className="font-bold text-slate-800">{ag.sinteticos.tmrMedioFormatado}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Sem Resposta</span>
                          <span className={`font-bold ${(ag.sinteticos.semRespostaPct ?? 0) > 30 ? "text-rose-600" : "text-slate-800"}`}>
                            {ag.sinteticos.semRespostaPct == null ? "N/D" : `${ag.sinteticos.semRespostaPct}%`}
                          </span>
                        </div>
                      </div>

                      {/* Top Highlights Preview */}
                      {ag.textoFortes && ag.textoFortes.length > 0 && (
                        <p className="text-xs text-slate-600 line-clamp-2 italic mb-4">
                          "{ag.textoFortes[0].texto}"
                        </p>
                      )}
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => {
                        setSelectedReportId(ag.id);
                        setActiveTab("dashboard");
                      }}
                      className="w-full py-2 px-3 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
                    >
                      <span>Abrir Ficha Completa</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ABA 3: AUDITORIA DE CONVERSAS (DRILL-DOWN)              */}
        {/* ======================================================== */}
        {activeTab === "auditoria" && (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Auditoria de Conversas & Transcrições
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Clique em qualquer conversa para ler a transcrição do WhatsApp e a justificativa da IA
                </p>
              </div>

              {/* Filter */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Filtrar por atendente..."
                    value={agentFilter}
                    onChange={(e) => setAgentFilter(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Conversation Cards List */}
            <div className="space-y-3">
              {filteredSessions.map((sess) => (
                <div
                  key={sess.id}
                  onClick={() => setSelectedSession(sess)}
                  className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-2xs hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      {sess.agentName.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {sess.agentName}
                        </span>
                        <span className="text-xs text-slate-400">• {sess.contactPhone}</span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {sess.panelName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-1 mt-0.5">
                        {sess.resumo1Linha ? `"${sess.resumo1Linha}"` : "Resumo indisponível"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                    <div className="text-left sm:text-right">
                      <span className="text-xs text-slate-400 block">{sess.startAt}</span>
                      <span className="text-[11px] text-slate-500">{sess.durationMinutes ?? "N/D"} min de atendimento</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-base font-extrabold text-blue-600">
                          {fmtNota(sess.notaConversa)}
                        </div>
                        <span className="text-[10px] text-slate-400 font-semibold block">nota IA</span>
                      </div>

                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ABA 4: PIPELINE & JOBS                                  */}
        {/* ======================================================== */}
        {activeTab === "pipeline" && (
          <div className="max-w-4xl">
            <div className="mb-6">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Status do Pipeline & Execuções
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Controle dos checkpoints e jobs retomáveis (A até E)
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 mb-6">
              <h2 className="text-sm font-bold text-slate-900 mb-4">
                Fluxo Contínuo de Dados
              </h2>

              {!pipeline || pipeline.dbStatus !== "online" ? (
                <p className="text-xs text-rose-700">Banco indisponível: sem status de jobs.</p>
              ) : (
                <div className="space-y-4">
                  <div className="text-xs text-slate-600">
                    Análises da IA (estágio 1):{" "}
                    {Object.entries(pipeline.analyses ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "nenhuma"}
                  </div>
                  {(pipeline.recentJobs ?? []).length === 0 && (
                    <p className="text-xs text-slate-500">Nenhum job executado ainda.</p>
                  )}
                  {(pipeline.recentJobs ?? []).map((j: any) => (
                    <div key={j.id} className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-900">{j.jobType}</div>
                        <p className="text-xs text-slate-500">
                          {j.startedAt ? new Date(j.startedAt).toLocaleString("pt-BR") : "—"}
                          {j.finishedAt ? ` → ${new Date(j.finishedAt).toLocaleString("pt-BR")}` : ""} · {j.itemsSuccess} ok · {j.itemsFailed} falhas
                        </p>
                        {j.errorMessage && <p className="text-xs text-rose-600">{j.errorMessage}</p>}
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {j.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick terminal commands box */}
            <div className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs">
              <div className="text-slate-400 mb-2 font-sans font-semibold">Comandos CLI Rápidos:</div>
              <div className="space-y-1 text-slate-300">
                <div><span className="text-emerald-400">$</span> npm run job:cards -- --all <span className="text-slate-500"># Carga inicial completa de cards CRM</span></div>
                <div><span className="text-emerald-400">$</span> npm run pipeline -- --days 7 <span className="text-slate-500"># Executa todo o fluxo de ponta a ponta</span></div>
                <div><span className="text-emerald-400">$</span> npm run web <span className="text-slate-500"># Inicia este servidor de plataforma (porta 3000)</span></div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal de Detalhe da Conversa (Drill-Down) */}
      <ConversationModal
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
      />
    </div>
  );
}
