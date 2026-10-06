import { NextResponse } from "next/server";
import { authorizeApi } from "@/auth/dal";
import { loadReports, parseTipo } from "@/lib/reports-loader";

export async function GET(request: Request) {
  const auth = await authorizeApi();
  if (auth instanceof Response) return auth;
  try {
    const { searchParams } = new URL(request.url);
    const reports = await loadReports(parseTipo(searchParams.get("tipo")), searchParams.get("period") || undefined);
    return NextResponse.json(reports);
  } catch (error: any) {
    return NextResponse.json({ error: "Banco indisponível" }, { status: 503 });
  }
}
