"use client";

import React from "react";
import { X } from "lucide-react";
import type { FaixaConversas, SessionDetail } from "@/lib/types";
import { fmtTituloPeriodo } from "@/lib/format";
import { type TipoPeriodo } from "@/lib/labels";
import { ConversationsList, type EscopoConversas } from "@/components/ConversationsList";

export interface FiltroEscopo extends EscopoConversas {
  /** Nome do escopo como aparece na tela. */
  nome: string;
}

interface ConversationsTabProps {
  tipo: TipoPeriodo;
  periodStart?: string;
  periodEnd?: string;
  /** Período na API: "tipo=mes&period=..." ou "de=...&ate=...". */
  baseQuery: string;
  faixa: FaixaConversas | null;
  onFaixa: (f: FaixaConversas | null) => void;
  /** Quando vem do resumo de uma equipe ou painel, a lista fica só dele. */
  escopo: FiltroEscopo | null;
  onLimparEscopo: () => void;
  onOpen: (s: SessionDetail) => void;
}

export const ConversationsTab: React.FC<ConversationsTabProps> = ({
  tipo,
  periodStart,
  periodEnd,
  baseQuery,
  faixa,
  onFaixa,
  escopo,
  onLimparEscopo,
  onOpen,
}) => (
  <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl leading-8 font-medium">Conversas</h1>
      <span className="text-muted">{periodStart && periodEnd ? fmtTituloPeriodo(tipo, periodStart, periodEnd) : ""}</span>
      {escopo && (
        <button
          type="button"
          onClick={onLimparEscopo}
          aria-label={`Tirar o filtro ${escopo.nome}`}
          className="self-start mt-1 inline-flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full bg-primary-soft text-primary-ink text-[13px] font-medium focus-visible:outline-2 outline-offset-2 outline-primary"
        >
          {escopo.nome}
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
    <ConversationsList tipo={tipo} baseQuery={baseQuery} escopo={escopo} faixa={faixa} onFaixa={onFaixa} onOpen={onOpen} />
  </div>
);
