import { DateTime } from "luxon";
import { escopoParaUrl } from "../lib/escopo-url";
import type { Frequencia } from "./frequencias";
import { fmtInt, fmtNomeMes, fmtNota } from "../lib/format";
import { META_NOTA, PERIODO, scoreStatus, type Tone } from "../lib/labels";
import { pontoMaisFraco, textoComparacao } from "../lib/resumo";
import type { CriteriaScores } from "../lib/types";

/**
 * O e-mail de resumo: função pura, sem banco nem rede. Os números e as frases saem das mesmas funções do
 * resumo do topo do painel (`SummaryBlock`), para o e-mail e a tela dizerem a mesma coisa. Nenhuma frase,
 * nome de cliente ou trecho de conversa entra aqui. Vocabulário do `docs/UI_REDESIGN.md` §8.
 */

const TZ = "America/Sao_Paulo";

export interface BlocoEmail {
  scopeType: string;
  scopeId: string;
  /** O escopo por extenso: "Equipe Peças", "Geral". */
  rotulo: string;
  notaGeral: number | null;
  /** Diferença para o período anterior (`comparativo.deltaNota`). */
  delta: number | null;
  /** Nome do mês anterior, no relatório mensal ("agosto"). */
  mesAnterior?: string;
  medias: CriteriaScores;
  /** Conversas abaixo da meta; null quando a contagem não está disponível. */
  abaixo: number | null;
  /** Menos de 10 conversas: os números ainda são instáveis. */
  preliminar: boolean;
}

export interface PeriodoEmail {
  granularity: Frequencia;
  start: string;
  end: string;
  /** Só no dia de hoje: a hora do último sync (ISO), até onde vão os números. Um dia que já passou não leva. */
  ate?: string;
}

export interface EntradaEmail {
  pessoa: { nome: string };
  periodo: PeriodoEmail;
  blocos: BlocoEmail[];
  /** Endereço público do painel, sem barra no fim. */
  appUrl: string;
}

export interface EmailMontado {
  assunto: string;
  html: string;
  texto: string;
}

export const AVISO_POUCAS = "Poucas conversas: números ainda instáveis";
export const AVISO_DIA_ABERTO = "O dia ainda não terminou: no painel, os números mudam conforme chegam novas conversas.";
export const AVISO_DESCADASTRO = "Para deixar de receber, fale com o administrador do painel.";

const dia = (iso: string) => DateTime.fromISO(iso, { zone: TZ });

/** "23 a 29/09" · "28/09 a 04/10". */
export function fmtSemanaCurta(start: string, end: string): string {
  const a = dia(start);
  const b = dia(end);
  if (a.month === b.month && a.year === b.year) return `${a.toFormat("d")} a ${b.toFormat("dd/MM")}`;
  return `${a.toFormat("dd/MM")} a ${b.toFormat("dd/MM")}`;
}

/** "Resumo do dia 06/10" · "Resumo da semana de 23 a 29/09" · "Resumo de setembro" (e, com um escopo só, "· Equipe Peças"). */
export function assuntoResumo(periodo: PeriodoEmail, blocos: Array<{ rotulo: string }>): string {
  const base =
    periodo.granularity === "dia"
      ? `Resumo do dia ${dia(periodo.start).toFormat("dd/MM")}`
      : periodo.granularity === "mes"
        ? `Resumo de ${fmtNomeMes(periodo.start)}`
        : `Resumo da semana de ${fmtSemanaCurta(periodo.start, periodo.end)}`;
  return blocos.length === 1 ? `${base} · ${blocos[0].rotulo}` : base;
}

/** O endereço que o botão abre: o período e o escopo certos, depois do login. */
export function linkResumo(appUrl: string, periodo: PeriodoEmail, escopo: { scopeType: string; scopeId: string }): string {
  const partes: string[] = [];
  if (periodo.granularity === "dia") {
    // O dia é um período livre de um dia só.
    const d = dia(periodo.start).toFormat("yyyy-MM-dd");
    partes.push(`de=${d}`, `ate=${d}`);
  } else {
    if (periodo.granularity === "mes") partes.push("tipo=mes");
    partes.push(`period=${encodeURIComponent(periodo.start)}`);
  }
  const esc = escopoParaUrl(escopo);
  if (esc) partes.push(`escopo=${encodeURIComponent(esc)}`);
  return `${appUrl.replace(/\/+$/, "")}/?${partes.join("&")}`;
}

/** As frases de um bloco, na ordem e com as palavras do resumo do topo do painel. */
export interface FrasesBloco {
  nota: string | null;
  status: string | null;
  tom: Tone;
  comparacao: string | null;
  fraco: string | null;
  abaixo: string | null;
  aviso: string | null;
}

export function frasesDoBloco(b: BlocoEmail, granularity: Frequencia): FrasesBloco {
  const status = scoreStatus(b.notaGeral);
  if (b.notaGeral == null) {
    const nesta = granularity === "dia" ? "neste dia" : PERIODO[granularity].nesta;
    return { nota: null, status: null, tom: "neutral", comparacao: null, fraco: null, abaixo: null, aviso: `Nenhuma conversa com nota ${nesta}.` };
  }
  const fraco = pontoMaisFraco(b.medias);
  const abaixo = b.abaixo;
  return {
    nota: fmtNota(b.notaGeral),
    status: `${status.label} de ${fmtNota(META_NOTA)}`,
    tom: status.tone,
    // O dia não compara com o anterior: um dia contra o outro oscila demais (o período livre do painel também não compara).
    comparacao: b.delta != null && granularity !== "dia" ? textoComparacao(b.delta, granularity, b.mesAnterior) : null,
    fraco: fraco === null ? null : fraco.media >= META_NOTA ? "Todos os critérios estão na meta" : `Ponto mais fraco: ${fraco.label}, média ${fmtNota(fraco.media)}`,
    abaixo:
      abaixo == null
        ? null
        : abaixo === 0
          ? "Nenhuma conversa ficou abaixo da meta"
          : `${fmtInt(abaixo)} ${abaixo === 1 ? "conversa ficou" : "conversas ficaram"} abaixo da meta`,
    aviso: b.preliminar ? AVISO_POUCAS : null,
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Cores do painel (src/app/globals.css). Os programas de e-mail ignoram <style>, então tudo vai no próprio elemento.
const COR = {
  ink: "#202124",
  ink2: "#3C4043",
  muted: "#5F6368",
  line: "#DADCE0",
  page: "#F8F9FA",
  primary: "#1A73E8",
};
const TOM: Record<Tone, { texto: string; fundo: string }> = {
  good: { texto: "#137333", fundo: "#E6F4EA" },
  warn: { texto: "#A15C00", fundo: "#FEF7E0" },
  bad: { texto: "#C5221F", fundo: "#FCE8E6" },
  neutral: { texto: "#5F6368", fundo: "#F1F3F4" },
};
const FONTE = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function blocoHtml(b: BlocoEmail, f: FrasesBloco, link: string): string {
  const tom = TOM[f.tom];
  const linhas = [f.comparacao, f.fraco, f.abaixo].filter((x): x is string => !!x);
  const corpo =
    f.nota == null
      ? `<p style="margin:12px 0 0;font-size:15px;line-height:22px;color:${COR.ink2};">${esc(f.aviso ?? "")}</p>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr>
  <td style="padding-right:16px;vertical-align:middle;"><div style="font-size:40px;line-height:44px;font-weight:600;color:${tom.texto};">${esc(f.nota)}</div></td>
  <td style="vertical-align:middle;"><span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${tom.fundo};color:${tom.texto};font-size:13px;line-height:18px;font-weight:600;">${esc(f.status ?? "")}</span></td>
</tr></table>
${linhas.map((l) => `<p style="margin:8px 0 0;font-size:15px;line-height:22px;color:${COR.ink2};">${esc(l)}</p>`).join("\n")}
${f.aviso ? `<p style="margin:12px 0 0;padding:8px 12px;border-radius:8px;background:${TOM.warn.fundo};font-size:13px;line-height:18px;color:${TOM.warn.texto};">${esc(f.aviso)}</p>` : ""}`;
  return `<tr><td style="padding:0 0 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${COR.line};border-radius:12px;background:#FFFFFF;"><tr><td style="padding:20px;">
<div style="font-size:18px;line-height:24px;font-weight:600;color:${COR.ink};">${esc(b.rotulo)}</div>
${corpo}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr><td style="border-radius:999px;background:${COR.primary};"><a href="${esc(link)}" style="display:inline-block;padding:10px 24px;font-size:15px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:999px;">Abrir o resumo</a></td></tr></table>
</td></tr></table>
</td></tr>`;
}

/** Primeiro nome, para o "Olá". */
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

export function montarEmailResumo(entrada: EntradaEmail): EmailMontado {
  const { pessoa, periodo, blocos, appUrl } = entrada;
  const assunto = assuntoResumo(periodo, blocos);
  const quando =
    periodo.granularity === "dia"
      ? `do dia ${dia(periodo.start).toFormat("dd/MM")}`
      : periodo.granularity === "mes"
        ? `do mês de ${fmtNomeMes(periodo.start)}`
        : `da semana de ${fmtSemanaCurta(periodo.start, periodo.end)}`;
  // Hoje: os números vão até a hora do último sync, e o dia ainda muda. Um dia que já passou não leva nenhum dos dois.
  const ate = periodo.granularity === "dia" && periodo.ate ? dia(periodo.ate).toFormat("HH:mm") : null;
  const abertura = `Olá, ${primeiroNome(pessoa.nome)}. Este é o resumo ${quando}${ate ? `, com as conversas até as ${ate}` : ""}.`;
  const avisoDia = ate ? AVISO_DIA_ABERTO : null;
  const linhaAviso = avisoDia ? `<tr><td style="padding:0 0 16px;font-size:13px;line-height:18px;color:${COR.muted};">${esc(avisoDia)}</td></tr>` : "";
  const acompanha = `Você acompanha: ${blocos.map((b) => b.rotulo).join(", ")}`;

  const itens = blocos.map((b) => ({ b, f: frasesDoBloco(b, periodo.granularity), link: linkResumo(appUrl, periodo, b) }));

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:${COR.page};font-family:${FONTE};color:${COR.ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COR.page};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:0 0 16px;font-size:13px;line-height:18px;color:${COR.muted};"><span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:8px;background:${COR.primary};color:#FFFFFF;font-weight:600;font-size:14px;vertical-align:middle;">T</span>
<span style="vertical-align:middle;margin-left:8px;"><strong style="color:${COR.ink};font-size:15px;">Tterrasul</strong> · Qualidade do atendimento</span></td></tr>
<tr><td style="padding:0 0 ${avisoDia ? 4 : 16}px;font-size:16px;line-height:24px;color:${COR.ink};">${esc(abertura)}</td></tr>
${linhaAviso}
${itens.map((i) => blocoHtml(i.b, i.f, i.link)).join("\n")}
<tr><td style="padding:8px 0 0;font-size:12px;line-height:18px;color:${COR.muted};">${esc(acompanha)}<br>${esc(AVISO_DESCADASTRO)}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const texto = [
    abertura,
    ...(avisoDia ? [avisoDia] : []),
    "",
    ...itens.flatMap(({ b, f, link }) => [
      b.rotulo,
      ...(f.nota == null ? [f.aviso ?? ""] : [`Nota ${f.nota} · ${f.status}`, ...[f.comparacao, f.fraco, f.abaixo].filter((x): x is string => !!x), ...(f.aviso ? [f.aviso] : [])]),
      `Abrir o resumo: ${link}`,
      "",
    ]),
    acompanha,
    AVISO_DESCADASTRO,
  ].join("\n");

  return { assunto, html, texto };
}
