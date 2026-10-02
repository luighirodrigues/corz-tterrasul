import { NextResponse } from "next/server";
import { FreePeriodError, resolveFreePeriod } from "@/lib/live-loader";
import { parseTipo, resolvePublishedWindow } from "@/lib/reports-loader";
import { loadAuditedSessions, loadSessionById, SESSIONS_PAGE_SIZE } from "@/lib/sessions-loader";
import type { FaixaConversas, OrdemConversas } from "@/lib/types";

const int = (v: string | null, fallback: number) => {
  const n = v == null ? NaN : parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const FAIXAS: FaixaConversas[] = ["abaixo", "meta", "sem"];
const ORDENS: OrdemConversas[] = ["recentes", "nota"];

const VAZIO = { sessions: [], total: 0, contagens: { todas: 0, abaixo: 0, naMeta: 0, semNota: 0 } };

/**
 * Conversas de um período, em páginas, sem as mensagens. O período é o publicado (tipo e period) ou o livre
 * (de e ate). Filtros: faixa=abaixo|meta|sem, ordem=recentes|nota, q, agente (id do atendente) e scopeType+scopeId (escopo do relatório).
 * Resposta: { sessions, total, contagens }.
 * Com `id`, devolve uma conversa só, com as mensagens: { sessions: [conversa] }.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const de = searchParams.get("de");
    const ate = searchParams.get("ate");
    const id = searchParams.get("id");

    if (id) {
      const s = await loadSessionById(id);
      return NextResponse.json({ sessions: s ? [s] : [], total: s ? 1 : 0 });
    }

    let window: { start: Date; end: Date } | null;
    if (de && ate) {
      const resolved = await resolveFreePeriod(de, ate);
      window = resolved ? resolved.free.period : null;
    } else {
      window = await resolvePublishedWindow(parseTipo(searchParams.get("tipo")), searchParams.get("period") || undefined);
    }
    if (!window) return NextResponse.json(VAZIO);

    const faixa = FAIXAS.find((f) => f === searchParams.get("faixa"));
    const ordem = ORDENS.find((o) => o === searchParams.get("ordem"));
    const page = await loadAuditedSessions({
      start: window.start,
      end: window.end,
      q: searchParams.get("q") || undefined,
      agent: searchParams.get("agent") || undefined,
      agente: searchParams.get("agente") || undefined,
      scopeType: searchParams.get("scopeType") || undefined,
      scopeId: searchParams.get("scopeId") || undefined,
      faixa,
      ordem,
      offset: int(searchParams.get("offset"), 0),
      limit: int(searchParams.get("limit"), SESSIONS_PAGE_SIZE),
    });
    return NextResponse.json(page);
  } catch (err) {
    if (err instanceof FreePeriodError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: "Banco indisponível" }, { status: 503 });
  }
}
