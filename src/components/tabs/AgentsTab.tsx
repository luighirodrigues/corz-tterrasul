import React from "react";
import { ChevronRight } from "lucide-react";
import type { ReportItem } from "@/lib/types";
import { SEM_RESPOSTA_ALERT_PCT } from "@/lib/thresholds";
import { fmtDuracao, fmtInt, fmtNota, fmtPct, fmtQtd, fmtTituloPeriodo } from "@/lib/format";
import { nomeEscopo, PERIODO, scoreStatus, TONE_DOT, type TipoPeriodo } from "@/lib/labels";

interface AgentsTabProps {
  agents: ReportItem[];
  tipo: TipoPeriodo;
  periodStart?: string;
  periodEnd?: string;
  onOpen: (id: string) => void;
}

const COLUNAS = "md:grid-cols-[28px_minmax(0,1fr)_96px_120px_110px_80px_24px]";

const primeiraResposta = (ag: ReportItem) =>
  ag.sinteticos.tmrMedioSegundos !== undefined ? fmtDuracao(ag.sinteticos.tmrMedioSegundos) : ag.sinteticos.tmrMedioFormatado || "—";

interface LinhaProps {
  ag: ReportItem;
  posicao?: number;
  /** Atendente sem nota: mostra quantas conversas teve no lugar das colunas. */
  semNota?: boolean;
  na: string;
  onOpen: (id: string) => void;
}

const Linha: React.FC<LinhaProps> = ({ ag, posicao, semNota, na, onOpen }) => {
  const tone = scoreStatus(ag.notaGeral).tone;
  const sr = ag.sinteticos.semRespostaPct;
  const n = ag.sinteticos.n;
  return (
    <button
      type="button"
      onClick={() => onOpen(ag.id)}
      className={`w-full text-left grid grid-cols-[minmax(0,1fr)_auto] ${COLUNAS} gap-x-4 gap-y-0.5 items-center min-h-16 px-5 py-2.5 border-b border-divider last:border-b-0 hover:bg-page focus-visible:outline-2 focus-visible:-outline-offset-2 outline-primary`}
    >
      <span className="hidden md:block text-[13px] font-medium text-muted">{posicao ?? ""}</span>
      <span className="flex flex-col min-w-0">
        <span className="font-medium truncate">
          {posicao != null && <span className="md:hidden text-muted font-normal">{posicao}º </span>}
          {nomeEscopo(ag.title)}
        </span>
        <span className="md:hidden text-xs text-muted">
          {[ag.equipe, semNota ? `${n === 0 ? "nenhuma conversa" : fmtQtd(n, "conversa", "conversas")}, sem nota` : fmtQtd(ag.totalConversas, "conversa", "conversas"), semNota ? null : primeiraResposta(ag)]
            .filter(Boolean)
            .join(", ")}
        </span>
        {ag.equipe && <span className="hidden md:block text-xs text-muted truncate">{ag.equipe}</span>}
      </span>
      {semNota ? (
        <span className="hidden md:block md:col-span-4 text-[13px] text-muted">
          {n === 0 ? `Nenhuma conversa ${na}` : `${fmtQtd(n, "conversa", "conversas")}, sem nota`}
        </span>
      ) : (
        <>
          <span className="hidden md:block text-ink-2">{fmtInt(ag.totalConversas)}</span>
          <span className="hidden md:block text-ink-2">{primeiraResposta(ag)}</span>
          <span className={`hidden md:block ${(sr ?? 0) > SEM_RESPOSTA_ALERT_PCT ? "text-bad" : "text-ink-2"}`}>{fmtPct(sr)}</span>
        </>
      )}
      {!semNota && (
        <span className="flex items-center justify-end gap-2 text-base font-medium md:w-full">
          <span className={`w-2 h-2 rounded-full ${TONE_DOT[tone]}`} />
          {fmtNota(ag.notaGeral)}
        </span>
      )}
      <ChevronRight className="hidden md:block w-5 h-5 text-muted" strokeWidth={1.75} />
    </button>
  );
};

const Cabecalho: React.FC = () => (
  <div className={`hidden md:grid ${COLUNAS} gap-4 items-center px-5 py-3 border-b border-line text-xs font-medium text-muted`}>
    <span />
    <span>Atendente</span>
    <span>Conversas</span>
    <span>1ª resposta</span>
    <span>Sem resposta</span>
    <span className="text-right">Nota</span>
    <span />
  </div>
);

const Grupo: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div>
    <div className="px-5 pt-4 pb-2 text-xs font-medium text-muted border-t border-line">{titulo}</div>
    {children}
  </div>
);

/** Atendentes em linhas: só tem posição quem tem 10 ou mais conversas com nota; os demais ficam em grupos à parte. */
export const AgentsTab: React.FC<AgentsTabProps> = ({ agents, tipo, periodStart, periodEnd, onOpen }) => {
  const t = PERIODO[tipo];
  const porNota = (a: ReportItem, b: ReportItem) => (b.notaGeral ?? -1) - (a.notaGeral ?? -1);
  const comPosicao = agents.filter((a) => !a.preliminar && a.totalConversas > 0).sort(porNota);
  const poucas = agents.filter((a) => a.preliminar && a.totalConversas > 0).sort((a, b) => b.totalConversas - a.totalConversas);
  const semNota = agents.filter((a) => a.totalConversas === 0).sort((a, b) => b.sinteticos.n - a.sinteticos.n);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl leading-8 font-medium">Atendentes</h1>
        <span className="text-muted">
          {periodStart && periodEnd ? `${fmtTituloPeriodo(tipo, periodStart, periodEnd)}, ` : ""}ordenados pela {t.nota.toLowerCase()}
        </span>
      </div>

      {agents.length === 0 ? (
        <p className="p-4 rounded-card bg-subtle text-[13px] text-ink-2">Nenhum atendente com conversas {t.nesta}.</p>
      ) : (
        <section className="bg-surface border border-line rounded-card overflow-hidden">
          {comPosicao.length > 0 && <Cabecalho />}
          {comPosicao.map((ag, i) => (
            <Linha key={ag.id} ag={ag} posicao={i + 1} na={t.na} onOpen={onOpen} />
          ))}
          {poucas.length > 0 && (
            <Grupo titulo="Poucas conversas para comparar">
              {poucas.map((ag) => (
                <Linha key={ag.id} ag={ag} na={t.na} onOpen={onOpen} />
              ))}
            </Grupo>
          )}
          {semNota.length > 0 && (
            <Grupo titulo={`Sem nota ${t.na}`}>
              {semNota.map((ag) => (
                <Linha key={ag.id} ag={ag} semNota na={t.na} onOpen={onOpen} />
              ))}
            </Grupo>
          )}
        </section>
      )}
    </div>
  );
};
