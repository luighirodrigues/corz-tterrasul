import { NextResponse } from "next/server";
import { loadAuditedSessions } from "@/lib/sessions-loader";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agent = searchParams.get("agent") || undefined;

    const sessions = await loadAuditedSessions(agent);
    return NextResponse.json(sessions);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
