import { DateTime } from "luxon";

const TZ = "America/Sao_Paulo";
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_CURTOS = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

/** "YYYY-MM-DD" vira data local sem passar por UTC; ISO com hora é convertido para o fuso de São Paulo. */
function toDay(s: string): DateTime {
  return DateTime.fromISO(s, { zone: TZ });
}

export function fmtNota(n: number | null | undefined): string {
  return n == null ? "—" : n.toFixed(1).replace(".", ",");
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Number(n.toFixed(1)).toString().replace(".", ",")}%`;
}

export function fmtDuracao(seg: number | null | undefined): string {
  if (seg == null || isNaN(seg) || seg < 0) return "—";
  if (seg < 60) return "menos de 1 min";
  const min = Math.floor(seg / 60);
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  if (horas < 24) return resto === 0 ? `${horas}h` : `${horas}h ${String(resto).padStart(2, "0")}min`;
  const dias = Math.floor(horas / 24);
  const h = horas % 24;
  const d = dias === 1 ? "1 dia" : `${dias} dias`;
  return h === 0 ? d : `${d} e ${h}h`;
}

export function fmtPeriodo(ini: string, fim: string): string {
  const a = toDay(ini);
  const b = toDay(fim);
  if (a.month === b.month && a.year === b.year) return `${a.day} a ${b.day} de ${MESES[b.month - 1]}`;
  return `${a.day} de ${MESES[a.month - 1]} a ${b.day} de ${MESES[b.month - 1]}`;
}

export function fmtPeriodoCurto(ini: string, fim: string): string {
  const a = toDay(ini);
  const b = toDay(fim);
  if (a.month === b.month && a.year === b.year) return `${a.day} a ${b.day} de ${MESES_CURTOS[b.month - 1]} de ${b.year}`;
  return `${a.day} de ${MESES_CURTOS[a.month - 1]} a ${b.day} de ${MESES_CURTOS[b.month - 1]} de ${b.year}`;
}

export function fmtAtualizado(iso: string, now: Date = new Date()): string {
  const d = DateTime.fromISO(iso, { zone: TZ });
  const hoje = DateTime.fromJSDate(now, { zone: TZ }).startOf("day");
  const hora = d.toFormat("HH:mm");
  const diff = Math.round(hoje.diff(d.startOf("day"), "days").days);
  if (diff === 0) return `hoje às ${hora}`;
  if (diff === 1) return `ontem às ${hora}`;
  return `em ${d.toFormat("dd/MM")} às ${hora}`;
}

/** "24/09" a partir de ISO ou "YYYY-MM-DD". */
export function fmtDiaMes(s: string): string {
  return toDay(s).toFormat("dd/MM");
}
