import { NextResponse } from "next/server";
import { loadReports } from "@/lib/reports-loader";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reports = await loadReports(searchParams.get("period") || undefined);
    return NextResponse.json(reports);
  } catch (error: any) {
    return NextResponse.json({ error: "Banco indisponível" }, { status: 503 });
  }
}
