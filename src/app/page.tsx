"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ContagensConversas, FaixaConversas, ReportItem, SessionDetail } from "@/lib/types";
import type { TrendPoint } from "@/components/TrendChart";
import { ConversationModal } from "@/components/ConversationModal";
import { ConversationsList } from "@/components/ConversationsList";
import { AppHeader, type TabId } from "@/components/layout/AppHeader";
import { mesAnterior, mesAteHoje, ultimos30Dias, ultimos7Dias, type Intervalo } from "@/components/layout/PeriodPicker";
import { OverviewTab } from "@/components/tabs/OverviewTab";
import { AgentsTab } from "@/components/tabs/AgentsTab";
import { ConversationsTab, type FiltroEscopo } from "@/components/tabs/ConversationsTab";
import { fmtAtualizado } from "@/lib/format";
import { MSG, nomeEscopo, type TipoPeriodo } from "@/lib/labels";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

interface Janela {
  start: string;
  end: string;
}

const Botao: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="h-10 px-5 rounded-full border border-line bg-surface text-primary font-medium hover:bg-primary-soft focus-visible:outline-2 outline-offset-2 outline-primary"
  >
    {children}
  </button>
);

export default function DashboardPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("");
  const [tab, setTab] = useState<TabId>("visao");
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [carregandoMsgs, setCarregandoMsgs] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [semanas, setSemanas] = useState<Janela[]>([]);
  const [meses, setMeses] = useState<Janela[]>([]);
  const [atualizado, setAtualizado] = useState<string | null>(null);
  const [history, setHistory] = useState<TrendPoint[]>([]);
  const [contagens, setContagens] = useState<ContagensConversas | null>(null);

  // Atendente aberto na aba Atendentes (o scopeId do relatório: vale para qualquer período).
  const [agenteId, setAgenteId] = useState<string | null>(null);
  // Filtros da aba Conversas (vêm do botão "Ver essas conversas") e da lista da ficha do atendente.
  const [faixa, setFaixa] = useState<FaixaConversas | null>(null);
  const [escopoFiltro, setEscopoFiltro] = useState<FiltroEscopo | null>(null);
  const [faixaAgente, setFaixaAgente] = useState<FaixaConversas | null>(null);
  const listaAgente = useRef<HTMLDivElement>(null);

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

  const onSemana = (start: string) => {
    setTipo("semana");
    setSelectedPeriod(start);
  };
  const onMes = (start: string) => {
    setTipo("mes");
    setSelectedPeriod(start);
  };
  const onIntervalo = (i: Intervalo) => {
    setTipo("livre");
    setSelectedPeriod("");
    setIntervalo(i);
  };

  // As semanas e os meses publicados, para o menu de período.
  useEffect(() => {
    if (!pronto) return;
    let ativo = true;
    const lista = (t: string, set: (d: Janela[]) => void) =>
      fetch(`/api/reports/periods?tipo=${t}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => ativo && set(d))
        .catch(() => ativo && set([]));
    lista("semana", setSemanas);
    lista("mes", setMeses);
    return () => {
      ativo = false;
    };
  }, [pronto]);

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
        setSelectedReportId((general ?? repData.find((r) => r.scopeType !== "agente") ?? repData[0])?.id ?? "");
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
  }, [pronto, baseQuery, livre, tentativa]);

  const general = reports.find((r) => r.scopeType === "geral");
  const scopeReports = reports.filter((r) => r.scopeType !== "agente");
  const agentReports = reports.filter((r) => r.scopeType === "agente");
  const visaoReport = scopeReports.find((r) => r.id === selectedReportId) ?? general ?? scopeReports[0];
  // A ficha só aparece se o atendente existe neste período; senão, volta a lista.
  const agenteReport = agenteId ? agentReports.find((r) => r.scopeId === agenteId) : undefined;
  const fichaAberta = tab === "atendentes" && !!agenteReport;
  // O relatório que a tela mostra agora: a ficha do atendente ou a visão escolhida.
  const currentReport = fichaAberta ? agenteReport : visaoReport;
  const periodoRef = visaoReport ?? reports[0];
  const tipoAtual: TipoPeriodo = periodoRef?.granularity ?? tipo;

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

  // As contagens por faixa de nota vêm da API de conversas: o resumo, o histograma e os filtros usam o mesmo número.
  useEffect(() => {
    setContagens(null);
    if (!currentReport || !pronto) return;
    let ativo = true;
    fetch(`/api/sessions?${baseQuery}&limit=1&scopeType=${currentReport.scopeType}&scopeId=${encodeURIComponent(currentReport.scopeId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => ativo && setContagens(d?.contagens ?? null))
      .catch(() => ativo && setContagens(null));
    return () => {
      ativo = false;
    };
  }, [pronto, baseQuery, currentReport?.scopeType, currentReport?.scopeId]);

  const goTab = (t: TabId) => {
    // Tocar na aba Atendentes de dentro da ficha volta para a lista.
    if (t === "atendentes" && tab === "atendentes") setAgenteId(null);
    setTab(t);
  };

  const openWeek = (start: string) => onSemana(start);

  // A lista não traz as mensagens: a janela abre na hora e busca a conversa inteira pelo id.
  const pedido = useRef(0);
  const abrirConversa = async (id: string, previa?: SessionDetail) => {
    const meu = ++pedido.current;
    if (previa) setSelectedSession(previa);
    setCarregandoMsgs(true);
    try {
      const r = await fetch(`/api/sessions?id=${encodeURIComponent(id)}`);
      if (!r.ok) return;
      const d = await r.json();
      if (meu === pedido.current && d.sessions?.[0]) setSelectedSession(d.sessions[0]);
    } catch {
      /* a conversa simplesmente não abre */
    } finally {
      if (meu === pedido.current) setCarregandoMsgs(false);
    }
  };
  const fecharConversa = () => {
    pedido.current++;
    setSelectedSession(null);
    setCarregandoMsgs(false);
  };

  // "Ver essas conversas" do resumo: a aba Conversas já filtrada pelas que estão abaixo da meta, só deste escopo.
  const verConversasAbaixo = () => {
    if (!currentReport) return;
    if (fichaAberta) {
      setFaixaAgente("abaixo");
      listaAgente.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setFaixa("abaixo");
    setEscopoFiltro(
      currentReport.scopeType === "geral"
        ? null
        : { scopeType: currentReport.scopeType, scopeId: currentReport.scopeId, nome: nomeEscopo(currentReport.title) },
    );
    setTab("conversas");
  };

  const vazio = (() => {
    if (tipo === "mes") {
      const ant = mesAnterior();
      const atual = mesAteHoje();
      return {
        texto: "Ainda não há mês fechado publicado.",
        botoes: [
          { label: `Ver ${ant.nome}`, ir: () => onIntervalo(ant.intervalo) },
          { label: `Ver ${atual.nome} até hoje`, ir: () => onIntervalo(atual.intervalo) },
        ],
      };
    }
    if (tipo === "livre") {
      return { texto: "Não há dados para este período.", botoes: [{ label: "Ver os últimos 30 dias", ir: () => onIntervalo(ultimos30Dias()) }] };
    }
    return { texto: "Ainda não há semana publicada.", botoes: [{ label: "Ver os últimos 7 dias", ir: () => onIntervalo(ultimos7Dias()) }] };
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        tab={tab}
        onTab={goTab}
        tipo={tipo}
        selectedPeriod={selectedPeriod}
        intervalo={intervalo}
        semanas={semanas}
        meses={meses}
        atual={periodoRef ? { start: periodoRef.periodStart, end: periodoRef.periodEnd } : null}
        atualizado={atualizado}
        onSemana={onSemana}
        onMes={onMes}
        onIntervalo={onIntervalo}
      />

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 pt-7 pb-14">
        {loading ? (
          <p className="text-muted">{MSG.carregando}</p>
        ) : error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-card bg-bad-soft text-bad text-[13px]">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setTentativa((n) => n + 1)}
              className="h-9 px-4 rounded-full border border-bad/40 font-medium hover:bg-surface focus-visible:outline-2 outline-primary"
            >
              Tentar de novo
            </button>
          </div>
        ) : !currentReport ? (
          <div className="flex flex-col items-start gap-4 p-5 rounded-card bg-subtle text-[13px] text-ink-2">
            <span>{vazio.texto}</span>
            <div className="flex flex-wrap gap-2">
              {vazio.botoes.map((b) => (
                <Botao key={b.label} onClick={b.ir}>
                  {b.label}
                </Botao>
              ))}
            </div>
          </div>
        ) : (
          <>
            {tab === "visao" && visaoReport && (
              <OverviewTab
                report={visaoReport}
                scopeReports={scopeReports}
                history={history}
                contagens={contagens}
                onSelect={setSelectedReportId}
                onBackToAgents={() => setTab("atendentes")}
                onOpenWeek={openWeek}
                onOpenSession={(id) => abrirConversa(id)}
                onVerConversas={verConversasAbaixo}
              />
            )}
            {tab === "atendentes" &&
              (agenteReport ? (
                <OverviewTab
                  report={agenteReport}
                  scopeReports={scopeReports}
                  history={history}
                  contagens={contagens}
                  onSelect={setSelectedReportId}
                  onBackToAgents={() => setAgenteId(null)}
                  onOpenWeek={openWeek}
                  onOpenSession={(id) => abrirConversa(id)}
                  onVerConversas={verConversasAbaixo}
                >
                  <section ref={listaAgente} className="flex flex-col gap-4 scroll-mt-32">
                    <h2 className="text-base font-medium">Conversas de {nomeEscopo(agenteReport.title)}</h2>
                    <ConversationsList
                      tipo={tipoAtual}
                      baseQuery={baseQuery}
                      escopo={{ scopeType: "agente", scopeId: agenteReport.scopeId }}
                      faixa={faixaAgente}
                      onFaixa={setFaixaAgente}
                      comBusca={false}
                      onOpen={(s) => abrirConversa(s.id, s)}
                    />
                  </section>
                </OverviewTab>
              ) : (
                <AgentsTab
                  agents={agentReports}
                  tipo={tipoAtual}
                  periodStart={periodoRef?.periodStart}
                  periodEnd={periodoRef?.periodEnd}
                  onOpen={(id) => {
                    setFaixaAgente(null);
                    setAgenteId(agentReports.find((r) => r.id === id)?.scopeId ?? null);
                    window.scrollTo(0, 0);
                  }}
                />
              ))}
            {tab === "conversas" && (
              <ConversationsTab
                tipo={tipoAtual}
                periodStart={periodoRef?.periodStart}
                periodEnd={periodoRef?.periodEnd}
                baseQuery={baseQuery}
                faixa={faixa}
                onFaixa={setFaixa}
                escopo={escopoFiltro}
                onLimparEscopo={() => setEscopoFiltro(null)}
                onOpen={(s) => abrirConversa(s.id, s)}
              />
            )}
          </>
        )}
      </main>

      <ConversationModal session={selectedSession} carregando={carregandoMsgs} onClose={fecharConversa} />
    </div>
  );
}
