import { DateTime } from "luxon";

export type Granularity = "semana" | "mes" | "livre";

export interface Period {
  start: Date; // início (inclusive)
  end: Date; // último milissegundo (inclusive)
  label: string; // "2026-09-16 a 2026-09-22", em datas locais
  granularity: Granularity;
}

const DEFAULT_TZ = "America/Sao_Paulo";

/** Dias de uma janela livre, no máximo (L-D4). */
export const MAX_FREE_PERIOD_DAYS = 366;

function zoned(ref: Date, tz: string): DateTime {
  const local = DateTime.fromJSDate(ref, { zone: tz });
  if (!local.isValid) throw new Error(`Fuso inválido: ${tz}`);
  return local;
}

function make(startLocal: DateTime, endLocal: DateTime, granularity: Granularity): Period {
  return {
    start: startLocal.toJSDate(),
    end: endLocal.toJSDate(),
    label: `${startLocal.toISODate()} a ${endLocal.toISODate()}`,
    granularity,
  };
}

function build(startLocal: DateTime): Period {
  return make(startLocal, startLocal.plus({ days: 7 }).minus({ milliseconds: 1 }), "semana");
}

function buildMonth(startLocal: DateTime): Period {
  return make(startLocal, startLocal.plus({ months: 1 }).minus({ milliseconds: 1 }), "mes");
}

/** Janela semanal que contém `ref`. `weekStartIsoDay`: 1 = segunda … 3 = quarta … 7 = domingo. */
export function periodContaining(ref: Date, tz: string = DEFAULT_TZ, weekStartIsoDay = 3): Period {
  const local = zoned(ref, tz);
  const daysBack = (local.weekday - weekStartIsoDay + 7) % 7;
  return build(local.startOf("day").minus({ days: daysBack }));
}

export function previousPeriod(p: Period, tz: string = DEFAULT_TZ): Period {
  return build(DateTime.fromJSDate(p.start, { zone: tz }).minus({ days: 7 }));
}

/** Última janela já encerrada em `now`. */
export function lastClosedPeriod(now: Date, tz: string = DEFAULT_TZ, weekStartIsoDay = 3): Period {
  return previousPeriod(periodContaining(now, tz, weekStartIsoDay), tz);
}

/** Mês do calendário (dia 1 ao último dia, no fuso do tenant) que contém `ref`. */
export function monthContaining(ref: Date, tz: string = DEFAULT_TZ): Period {
  return buildMonth(zoned(ref, tz).startOf("month"));
}

export function previousMonth(p: Period, tz: string = DEFAULT_TZ): Period {
  return buildMonth(DateTime.fromJSDate(p.start, { zone: tz }).minus({ months: 1 }).startOf("month"));
}

/** Último mês já encerrado em `now`. */
export function lastClosedMonth(now: Date, tz: string = DEFAULT_TZ): Period {
  return previousMonth(monthContaining(now, tz), tz);
}

/** "2026-09" → mês de setembro de 2026. */
export function parseMonth(key: string, tz: string = DEFAULT_TZ): Period {
  const m = /^(\d{4})-(\d{2})$/.exec(key.trim());
  const start = m ? DateTime.fromObject({ year: +m[1], month: +m[2], day: 1 }, { zone: tz }) : null;
  if (!start || !start.isValid) throw new Error(`Mês inválido: ${key} (use AAAA-MM)`);
  return buildMonth(start);
}

/** "2026-09" do mês de uma janela mensal (nome de arquivo, chave). */
export function monthKey(p: Period, tz: string = DEFAULT_TZ): string {
  return DateTime.fromJSDate(p.start, { zone: tz }).toFormat("yyyy-MM");
}

/** A janela anterior do mesmo tipo: semana → semana anterior; mês → mês anterior. */
export function previousOf(p: Period, tz: string = DEFAULT_TZ): Period {
  if (p.granularity === "mes") return previousMonth(p, tz);
  if (p.granularity === "semana") return previousPeriod(p, tz);
  throw new Error("Período livre não tem período anterior.");
}

/**
 * Semanas que pertencem ao mês: a semana conta no mês em que cai o seu 4º dia (D7).
 * Com semana de quarta a terça, é o sábado. Um mês tem 4 ou 5 semanas.
 */
export function weeksOfMonth(mes: Period, tz: string = DEFAULT_TZ, weekStartIsoDay = 3): Period[] {
  const monthStart = DateTime.fromJSDate(mes.start, { zone: tz });
  const monthEnd = DateTime.fromJSDate(mes.end, { zone: tz });
  const weeks: Period[] = [];
  // Começa uma semana antes: a que contém o dia 1 pode ter o 4º dia no mês anterior.
  let week = periodContaining(mes.start, tz, weekStartIsoDay);
  week = previousPeriod(week, tz);
  for (;;) {
    const fourth = DateTime.fromJSDate(week.start, { zone: tz }).plus({ days: 3 });
    if (fourth > monthEnd) break;
    if (fourth >= monthStart) weeks.push(week);
    week = build(DateTime.fromJSDate(week.start, { zone: tz }).plus({ days: 7 }));
  }
  return weeks;
}

export interface FreePeriodInput {
  /** "AAAA-MM-DD" (data local). */
  de: string;
  ate: string;
  now: Date;
  tz?: string;
  /** Início do go-live: período que começa antes é cortado nele (com aviso). */
  goLiveAt?: Date | null;
}

export interface FreePeriodResult {
  period: Period;
  /** Quando o início foi ajustado para o go-live. */
  adjustedToGoLive: boolean;
  /** O fim do intervalo é hoje: as conversas de hoje ainda não têm nota. */
  includesToday: boolean;
}

/** Período livre escolhido na tela (L-D4): `de` às 00:00 e `ate` às 23:59:59.999 no fuso do tenant. */
export function parseFreePeriod(input: FreePeriodInput): FreePeriodResult {
  const tz = input.tz ?? DEFAULT_TZ;
  const day = (s: string) => {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? DateTime.fromISO(s, { zone: tz }) : null;
    if (!d || !d.isValid) throw new Error(`Data inválida: ${s} (use AAAA-MM-DD)`);
    return d.startOf("day");
  };
  let start: DateTime = day(input.de);
  const lastDay = day(input.ate);
  const today = zoned(input.now, tz).startOf("day");

  if (lastDay < start) throw new Error("A data final é anterior à data inicial.");
  if (lastDay > today) throw new Error("A data final não pode ser depois de hoje.");

  let adjustedToGoLive = false;
  if (input.goLiveAt) {
    const goLive = zoned(input.goLiveAt, tz).startOf("day");
    if (lastDay < goLive) throw new Error("Não há dados antes de " + goLive.toFormat("dd/MM/yyyy") + ".");
    if (start < goLive) {
      start = goLive;
      adjustedToGoLive = true;
    }
  }

  const days = Math.round(lastDay.diff(start, "days").days) + 1;
  if (days > MAX_FREE_PERIOD_DAYS) throw new Error(`O período pode ter no máximo ${MAX_FREE_PERIOD_DAYS} dias.`);

  const end = lastDay.plus({ days: 1 }).minus({ milliseconds: 1 });
  return { period: make(start, end, "livre"), adjustedToGoLive, includesToday: +lastDay === +today };
}

export function isClosed(p: Period, now: Date = new Date()): boolean {
  return p.end.getTime() < now.getTime();
}
