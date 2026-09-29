import { NextResponse } from "next/server";
import { listPublishedPeriods } from "@/lib/reports-loader";

export async function GET() {
  try {
    return NextResponse.json(await listPublishedPeriods());
  } catch {
    return NextResponse.json({ error: "Banco indisponível" }, { status: 503 });
  }
}
