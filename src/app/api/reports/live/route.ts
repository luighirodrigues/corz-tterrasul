import { NextResponse } from "next/server";
import { FreePeriodError, loadLiveReports } from "@/lib/live-loader";

/** Relatório de um intervalo livre (`?de=2026-09-05&ate=2026-09-10`), calculado na hora. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const de = searchParams.get("de");
  const ate = searchParams.get("ate");
  if (!de || !ate) return NextResponse.json({ error: "Informe as datas inicial e final." }, { status: 400 });

  try {
    return NextResponse.json(await loadLiveReports(de, ate));
  } catch (err) {
    if (err instanceof FreePeriodError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: "Banco indisponível" }, { status: 503 });
  }
}
