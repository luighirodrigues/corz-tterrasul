import { NextResponse } from "next/server";
import { authorizeApi } from "@/auth/dal";
import { listPublishedPeriods, parseTipo } from "@/lib/reports-loader";

export async function GET(request: Request) {
  const auth = await authorizeApi();
  if (auth instanceof Response) return auth;
  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json(await listPublishedPeriods(parseTipo(searchParams.get("tipo"))));
  } catch {
    return NextResponse.json({ error: "Banco indisponível" }, { status: 503 });
  }
}
