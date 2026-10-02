import React from "react";
import { ChevronRight, Star } from "lucide-react";
import type { Destaque, Destaques } from "@/lib/types";
import { fmtNota } from "@/lib/format";
import { scoreStatus, TONE_DOT } from "@/lib/labels";

interface HighlightsBlockProps {
  destaques?: Destaques;
  onOpen: (sessionExternalId: string) => void;
}

const Lista: React.FC<{ titulo: string; vazio: string; itens: Destaque[]; onOpen: (id: string) => void }> = ({
  titulo,
  vazio,
  itens,
  onOpen,
}) => (
  <div className="flex-[1_1_420px] flex flex-col">
    <div className="pb-3 border-b border-divider">
      <span className="text-[15px] font-medium">{titulo}</span>
    </div>
    {itens.length === 0 ? (
      <p className="py-4 text-[13px] text-muted">{vazio}</p>
    ) : (
      itens.map((d) => {
        const tone = scoreStatus(d.nota).tone;
        return (
          <button
            key={d.sessionExternalId}
            type="button"
            onClick={() => onOpen(d.sessionExternalId)}
            className="w-full text-left flex items-center gap-3 min-h-16 py-3 border-b border-divider last:border-b-0 hover:bg-page -mx-2 px-2 rounded-lg"
          >
            <span className="flex items-center gap-2 w-14 shrink-0 text-base font-medium">
              <span className={`w-2 h-2 rounded-full ${TONE_DOT[tone]}`} />
              {fmtNota(d.nota)}
            </span>
            <span className="flex flex-col min-w-0 flex-1">
              <span className="leading-[22px] line-clamp-2">{d.resumo}</span>
              {d.agentName && <span className="text-xs text-muted">{d.agentName}</span>}
            </span>
            <ChevronRight className="w-5 h-5 text-muted shrink-0" strokeWidth={1.75} />
          </button>
        );
      })
    )}
  </div>
);

/** Período livre não tem resumo da IA: no lugar entram as conversas de maior e de menor nota. */
export const HighlightsBlock: React.FC<HighlightsBlockProps> = ({ destaques, onOpen }) => (
  <section className="bg-surface border border-line rounded-card p-6 flex flex-col gap-5">
    <div className="flex items-center gap-3">
      <Star className="w-[22px] h-[22px] text-primary" strokeWidth={1.75} />
      <div className="flex flex-col">
        <h2 className="text-base font-medium">Conversas em destaque</h2>
        <span className="text-[13px] text-muted">As 3 melhores e as 3 piores notas do período. Clique para ler a conversa.</span>
      </div>
    </div>
    <div className="flex flex-wrap gap-8">
      <Lista titulo="Melhores notas" vazio="Nenhuma conversa avaliada neste período." itens={destaques?.melhores ?? []} onOpen={onOpen} />
      <Lista titulo="Piores notas" vazio="Nenhuma conversa avaliada neste período." itens={destaques?.piores ?? []} onOpen={onOpen} />
    </div>
  </section>
);
