"use client";

import React, { useEffect, useRef, useState } from "react";
import { Calendar, Check, ChevronDown } from "lucide-react";
import { DateTime } from "luxon";
import { fmtMes, fmtMesMinimo, fmtPeriodoCurto, fmtPeriodoMinimo, fmtPeriodoSemAno } from "@/lib/format";
import type { TipoPeriodo } from "@/lib/labels";

const TZ = "America/Sao_Paulo";

export interface Intervalo {
  de: string; // YYYY-MM-DD
  ate: string;
}

interface Janela {
  start: string;
  end: string;
}

const hoje = () => DateTime.now().setZone(TZ).startOf("day");

const ATALHOS: Array<{ label: string; intervalo: () => Intervalo }> = [
  { label: "Últimos 7 dias", intervalo: () => ({ de: hoje().minus({ days: 6 }).toISODate()!, ate: hoje().toISODate()! }) },
  { label: "Últimos 30 dias", intervalo: () => ({ de: hoje().minus({ days: 29 }).toISODate()!, ate: hoje().toISODate()! }) },
  { label: "Este mês", intervalo: () => ({ de: hoje().startOf("month").toISODate()!, ate: hoje().toISODate()! }) },
];

/** Intervalo inicial quando o gestor escolhe "Escolher datas…". */
export const ultimos30Dias = (): Intervalo => ATALHOS[1].intervalo();
export const ultimos7Dias = (): Intervalo => ATALHOS[0].intervalo();
export const mesAteHoje = (): { intervalo: Intervalo; nome: string } => ({
  intervalo: ATALHOS[2].intervalo(),
  nome: hoje().setLocale("pt-BR").toFormat("LLLL"),
});

/** O mês anterior inteiro, como intervalo livre (calculado agora). */
export const mesAnterior = (): { intervalo: Intervalo; nome: string } => {
  const ini = hoje().minus({ months: 1 }).startOf("month");
  return { intervalo: { de: ini.toISODate()!, ate: ini.endOf("month").toISODate()! }, nome: ini.setLocale("pt-BR").toFormat("LLLL") };
};

export interface PeriodPickerProps {
  tipo: TipoPeriodo;
  /** Início do período publicado ("" = o mais recente). */
  selectedPeriod: string;
  intervalo: Intervalo | null;
  semanas: Janela[];
  meses: Janela[];
  /** O período que a tela mostra agora, para o texto do botão. */
  atual: Janela | null;
  atualizado: string | null;
  onSemana: (start: string) => void;
  onMes: (start: string) => void;
  onIntervalo: (i: Intervalo) => void;
}

const ITEM =
  "flex w-full items-center justify-between gap-3 h-10 px-4 text-left hover:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 outline-primary";
const MARCADO = "bg-primary-soft text-primary-ink font-medium";

export const PeriodPicker: React.FC<PeriodPickerProps> = ({
  tipo,
  selectedPeriod,
  intervalo,
  semanas,
  meses,
  atual,
  atualizado,
  onSemana,
  onMes,
  onIntervalo,
}) => {
  const [open, setOpen] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  // Rascunho das datas: só vale no "Aplicar".
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  const fechar = (devolverFoco = true) => {
    setOpen(false);
    setEscolhendo(false);
    if (devolverFoco) botao.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) fechar(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // O foco vai para o item escolhido.
    const alvo =
      menu.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu.current?.querySelector<HTMLElement>('[role^="menuitem"]');
    alvo?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const navegar = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const alvo = e.target as HTMLElement;
    if (!alvo.matches('[role^="menuitem"]')) return;
    const itens = [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const i = itens.indexOf(alvo);
    const j = e.key === "Home" ? 0 : e.key === "End" ? itens.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length;
    e.preventDefault();
    itens[j]?.focus();
  };

  const abrirDatas = () => {
    const base = intervalo ?? ultimos30Dias();
    setDe(base.de);
    setAte(base.ate);
    setEscolhendo(true);
  };

  const max = hoje().toISODate()!;
  const invertido = !!de && !!ate && de > ate;
  const podeAplicar = !!de && !!ate && !invertido;

  // Texto do botão: a forma completa no computador e a curta no celular.
  const rotulo = (curto: boolean): string => {
    if (!atual) return tipo === "mes" ? "Mês" : tipo === "livre" ? "Período" : "Semana";
    if (tipo === "mes") return curto ? fmtMesMinimo(atual.start) : fmtMes(atual.start);
    return curto ? fmtPeriodoMinimo(atual.start, atual.end) : fmtPeriodoSemAno(atual.start, atual.end);
  };

  const semanaMarcada = (i: number, start: string) => tipo === "semana" && (selectedPeriod ? selectedPeriod === start : i === 0);
  const mesMarcado = (i: number, start: string) => tipo === "mes" && (selectedPeriod ? selectedPeriod === start : i === 0);
  const atalhoMarcado = (a: Intervalo) => tipo === "livre" && intervalo?.de === a.de && intervalo?.ate === a.ate;

  return (
    <div ref={ref} className="relative">
      <button
        ref={botao}
        type="button"
        onClick={() => (open ? fechar(false) : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Período: ${rotulo(false)}`}
        className="flex items-center gap-2 h-10 pl-3.5 pr-3 rounded-lg border border-line bg-surface font-medium hover:bg-subtle focus-visible:outline-2 outline-primary"
      >
        <Calendar className="w-[18px] h-[18px] text-muted shrink-0" strokeWidth={1.75} />
        <span className="sm:hidden whitespace-nowrap">{rotulo(true)}</span>
        <span className="hidden sm:inline whitespace-nowrap">{rotulo(false)}</span>
        <ChevronDown className="w-[18px] h-[18px] text-muted shrink-0" strokeWidth={1.75} />
      </button>

      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Período"
          onKeyDown={navegar}
          className="absolute z-50 right-0 top-full mt-1 w-[320px] max-w-[calc(100vw-32px)] max-h-[75vh] overflow-y-auto py-2 bg-surface rounded-card shadow-menu"
        >
          {semanas.length > 0 && (
            <div role="group" aria-label="Semanas">
              <div className="px-4 pt-2.5 pb-1 text-xs font-medium text-muted">Semanas</div>
              {semanas.map((p, i) => (
                <button
                  key={p.start}
                  type="button"
                  role="menuitemradio"
                  aria-checked={semanaMarcada(i, p.start)}
                  onClick={() => {
                    onSemana(i === 0 ? "" : p.start);
                    fechar();
                  }}
                  className={`${ITEM} ${semanaMarcada(i, p.start) ? MARCADO : ""}`}
                >
                  {fmtPeriodoCurto(p.start, p.end)}
                  {semanaMarcada(i, p.start) && <Check className="w-[18px] h-[18px]" strokeWidth={1.75} />}
                </button>
              ))}
            </div>
          )}

          {meses.length > 0 && (
            <div role="group" aria-label="Meses">
              <div className="px-4 pt-2.5 pb-1 text-xs font-medium text-muted">Meses</div>
              {meses.map((p, i) => (
                <button
                  key={p.start}
                  type="button"
                  role="menuitemradio"
                  aria-checked={mesMarcado(i, p.start)}
                  onClick={() => {
                    onMes(i === 0 ? "" : p.start);
                    fechar();
                  }}
                  className={`${ITEM} ${mesMarcado(i, p.start) ? MARCADO : ""}`}
                >
                  {fmtMes(p.start)}
                  {mesMarcado(i, p.start) && <Check className="w-[18px] h-[18px]" strokeWidth={1.75} />}
                </button>
              ))}
            </div>
          )}

          <div role="group" aria-label="Atalhos">
            <div className="px-4 pt-2.5 pb-1 text-xs font-medium text-muted">Atalhos</div>
            {ATALHOS.map((a) => {
              const marcado = atalhoMarcado(a.intervalo());
              return (
                <button
                  key={a.label}
                  type="button"
                  role="menuitemradio"
                  aria-checked={marcado}
                  onClick={() => {
                    onIntervalo(a.intervalo());
                    fechar();
                  }}
                  className={`${ITEM} ${marcado ? MARCADO : ""}`}
                >
                  {a.label}
                  {marcado && <Check className="w-[18px] h-[18px]" strokeWidth={1.75} />}
                </button>
              );
            })}
            <button type="button" role="menuitem" onClick={abrirDatas} aria-expanded={escolhendo} className={ITEM}>
              Escolher datas…
            </button>
          </div>

          {escolhendo && (
            <div className="flex flex-col gap-2 px-4 pt-2 pb-3">
              <div className="flex items-center gap-2">
                <label className="flex-1 flex flex-col gap-1 text-xs text-muted">
                  De
                  <input
                    type="date"
                    value={de}
                    max={max}
                    onChange={(e) => setDe(e.target.value)}
                    className="h-10 px-2 rounded-lg border border-line bg-surface text-ink text-[13px] font-medium"
                  />
                </label>
                <label className="flex-1 flex flex-col gap-1 text-xs text-muted">
                  Até
                  <input
                    type="date"
                    value={ate}
                    max={max}
                    onChange={(e) => setAte(e.target.value)}
                    className="h-10 px-2 rounded-lg border border-line bg-surface text-ink text-[13px] font-medium"
                  />
                </label>
              </div>
              {invertido && <span className="text-xs text-bad">A data final precisa ser igual ou depois da inicial.</span>}
              <button
                type="button"
                disabled={!podeAplicar}
                onClick={() => {
                  onIntervalo({ de, ate });
                  fechar();
                }}
                className="self-end h-10 px-5 rounded-full bg-primary text-white font-medium hover:bg-primary-hover disabled:opacity-50"
              >
                Aplicar
              </button>
            </div>
          )}

          {atualizado && <div className="mt-1 px-4 pt-3 pb-1 border-t border-divider text-xs text-muted">Dados atualizados {atualizado}</div>}
        </div>
      )}
    </div>
  );
};
