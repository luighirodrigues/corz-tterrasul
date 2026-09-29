import { NextResponse } from "next/server";
import { loadAuditedSessions } from "@/lib/sessions-loader";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessions = await loadAuditedSessions(searchParams.get("agent") || undefined);
    return NextResponse.json(sessions);
  } catch {
    return NextResponse.json({ error: "Banco indisponível" }, { status: 503 });
  }
}
