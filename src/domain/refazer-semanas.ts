import { DateTime } from "luxon";
import { lastClosedPeriod, periodContaining, type Period } from "./period.js";

export interface PlanoRefazerSemanas {
  /** Início das semanas publicadas que não começam no dia configurado (o formato antigo): saem do banco. */
  apagar: Date[];
  /** Todas as semanas no formato atual, da primeira até a última encerrada. O job E pula as que já existem. */
  semanas: Period[];
}

/**
 * O plano do `semanas:refazer`, usado quando muda o dia em que a semana começa (`PERIOD_WEEK_START`). A primeira semana
 * é a que contém `desde`, ou a da semana publicada mais antiga, ou a do go-live. Rodar de novo dá o mesmo resultado:
 * depois de apagadas, as antigas não voltam, e a mais antiga passa a ser a primeira semana nova.
 */
export function planoRefazerSemanas(input: {
  publicadas: Date[];
  desde?: Date;
  goLive?: Date | null;
  now: Date;
  tz: string;
  weekStart: number;
}): PlanoRefazerSemanas {
  const { tz, weekStart } = input;
  const local = (d: Date) => DateTime.fromJSDate(d, { zone: tz });
  const unicas = [...new Map(input.publicadas.map((d) => [d.getTime(), d])).values()].sort((a, b) => a.getTime() - b.getTime());

  const apagar = unicas.filter((d) => local(d).weekday !== weekStart || !local(d).equals(local(d).startOf("day")));

  const inicio = input.desde ?? unicas[0] ?? input.goLive ?? null;
  if (!inicio) throw new Error("Não há semana publicada nem GO_LIVE_AT: informe --desde AAAA-MM-DD.");

  const ultima = lastClosedPeriod(input.now, tz, weekStart);
  const semanas: Period[] = [];
  for (let s = periodContaining(inicio, tz, weekStart); s.start <= ultima.start; ) {
    semanas.push(s);
    s = periodContaining(new Date(s.end.getTime() + 1), tz, weekStart);
  }
  return { apagar, semanas };
}
