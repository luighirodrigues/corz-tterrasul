import { DateTime } from "luxon";

export interface Period {
  start: Date; // início (inclusive)
  end: Date; // último milissegundo (inclusive)
  label: string; // "2026-09-16 a 2026-09-22", em datas locais
}

const DEFAULT_TZ = "America/Sao_Paulo";

function build(startLocal: DateTime): Period {
  const endLocal = startLocal.plus({ days: 7 }).minus({ milliseconds: 1 });
  return {
    start: startLocal.toJSDate(),
    end: endLocal.toJSDate(),
    label: `${startLocal.toISODate()} a ${endLocal.toISODate()}`,
  };
}

/** Janela semanal que contém `ref`. `weekStartIsoDay`: 1 = segunda … 3 = quarta … 7 = domingo. */
export function periodContaining(ref: Date, tz: string = DEFAULT_TZ, weekStartIsoDay = 3): Period {
  const local = DateTime.fromJSDate(ref, { zone: tz });
  if (!local.isValid) throw new Error(`Fuso inválido: ${tz}`);
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

export function isClosed(p: Period, now: Date = new Date()): boolean {
  return p.end.getTime() < now.getTime();
}
