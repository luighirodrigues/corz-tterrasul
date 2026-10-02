import { NextResponse } from "next/server";
import { loadWeeksOfMonth } from "@/lib/reports-loader";

/** As semanas oficiais de um mês publicado (a que mês cada semana pertence: D7), com a nota de cada uma. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period");
  const scopeType = searchParams.get("scopeType");
  const scopeId = searchParams.get("scopeId");
  if (!period || !scopeType || !scopeId) {
    return NextResponse.json({ error: "period, scopeType e scopeId são obrigatórios" }, { status: 400 });
  }
  try {
    return NextResponse.json(await loadWeeksOfMonth(period, { scopeType, scopeId }));
  } catch {
    return NextResponse.json({ error: "Banco indisponível" }, { status: 503 });
  }
}
