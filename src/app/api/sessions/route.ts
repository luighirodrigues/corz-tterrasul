import { NextResponse } from "next/server";
import { FreePeriodError, resolveFreePeriod } from "@/lib/live-loader";
import { parseTipo, resolvePublishedWindow } from "@/lib/reports-loader";
import { loadAuditedSessions, SESSIONS_PAGE_SIZE } from "@/lib/sessions-loader";

const int = (v: string | null, fallback: number) => {
  const n = v == null ? NaN : parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * Conversas avaliadas de um período, em páginas. O período é o publicado (tipo e period) ou o livre
 * (de e ate). Resposta: { sessions, total }.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const de = searchParams.get("de");
    const ate = searchParams.get("ate");
    const id = searchParams.get("id");

    let window: { start: Date; end: Date } | null;
    if (id) {
      window = { start: new Date(0), end: new Date() }; // uma conversa pelo id: a janela não conta
    } else if (de && ate) {
      const resolved = await resolveFreePeriod(de, ate);
      window = resolved ? resolved.free.period : null;
    } else {
      window = await resolvePublishedWindow(parseTipo(searchParams.get("tipo")), searchParams.get("period") || undefined);
    }
    if (!window) return NextResponse.json({ sessions: [], total: 0 });

    const page = await loadAuditedSessions({
      start: window.start,
      end: window.end,
      externalId: id || undefined,
      q: searchParams.get("q") || undefined,
      agent: searchParams.get("agent") || undefined,
      offset: int(searchParams.get("offset"), 0),
      limit: int(searchParams.get("limit"), SESSIONS_PAGE_SIZE),
    });
    return NextResponse.json(page);
  } catch (err) {
    if (err instanceof FreePeriodError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: "Banco indisponível" }, { status: 503 });
  }
}
