import React from "react";
import type { AiInsight } from "@/lib/types";
import { Sparkles, CircleCheck, Lightbulb } from "lucide-react";
import { PERIODO, type TipoPeriodo } from "@/lib/labels";

interface AiInsightsBlockProps {
  pontosFortes: AiInsight[] | null;
  oportunidades: AiInsight[] | null;
  totalConversas: number;
  /** Semana (padrão) ou mês: muda só os textos. */
  tipo?: Exclude<TipoPeriodo, "livre">;
}

const base = (item: AiInsight, total: number) =>
  `Base: ${item.n_casos} ${item.n_casos === 1 ? "conversa" : "conversas"}${item.n_casos < total ? ` de ${total}` : ""}`;

export const AiInsightsBlock: React.FC<AiInsightsBlockProps> = ({ pontosFortes, oportunidades, totalConversas, tipo = "semana" }) => {
  const t = PERIODO[tipo];
  if (pontosFortes === null && oportunidades === null) {
    return (
      <section className="bg-surface border border-line rounded-card p-6 text-[13px] text-muted">{t.semAnalise}</section>
    );
  }
  const fortes = pontosFortes ?? [];
  const ops = oportunidades ?? [];

  return (
    <section className="bg-surface border border-line rounded-card p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Sparkles className="w-[22px] h-[22px] text-primary" strokeWidth={1.75} />
        <div className="flex flex-col">
          <h2 className="text-base font-medium">{t.analise}</h2>
          <span className="text-[13px] text-muted">
            Resumo gerado por IA a partir {totalConversas === 1 ? "da conversa avaliada" : `das ${totalConversas} conversas avaliadas`}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-8">
        <div className="flex-[1_1_420px] flex flex-col">
          <div className="flex items-center gap-2 pb-3 border-b border-divider">
            <CircleCheck className="w-5 h-5 text-good" strokeWidth={1.75} />
            <span className="text-[15px] font-medium">O que está funcionando</span>
          </div>
          {fortes.length === 0 ? (
            <p className="py-4 text-[13px] text-muted">Nenhum ponto forte registrado {t.nesta}.</p>
          ) : (
            fortes.map((item, i) => (
              <div key={i} className="flex flex-col gap-1.5 py-4 border-b border-divider last:border-b-0">
                <p className="leading-[22px]">{item.texto}</p>
                <span className="text-xs text-muted">{base(item, totalConversas)}</span>
              </div>
            ))
          )}
        </div>

        <div className="flex-[1_1_420px] flex flex-col">
          <div className="flex items-center gap-2 pb-3 border-b border-divider">
            <Lightbulb className="w-5 h-5 text-warn" strokeWidth={1.75} />
            <span className="text-[15px] font-medium">Onde melhorar</span>
          </div>
          {ops.length === 0 ? (
            <p className="py-4 text-[13px] text-muted">Nenhuma oportunidade crítica identificada.</p>
          ) : (
            ops.map((item, i) => (
              <div key={i} className="flex flex-col gap-2.5 py-4 border-b border-divider last:border-b-0">
                <p className="leading-[22px]">{item.texto}</p>
                {item.script_sugerido && (
                  <div className="bg-page rounded-lg px-4 py-3 flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted">Sugestão de fala</span>
                    <span className="leading-[22px]">{item.script_sugerido}</span>
                  </div>
                )}
                <span className="text-xs text-muted">{base(item, totalConversas)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
