import { NextResponse } from "next/server";
import { loadAllReports } from "@/lib/reports-loader";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");

    const reports = await loadAllReports();

    if (slug) {
      const found = reports.find((r) => r.slug === slug || r.id === slug);
      if (!found) {
        return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 });
      }
      return NextResponse.json(found);
    }

    return NextResponse.json(reports);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
