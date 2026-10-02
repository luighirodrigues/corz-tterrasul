import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { parseTipo } from "@/lib/reports-loader";

/**
 * Série histórica: a nota OFICIAL de cada semana (ou de cada mês, com tipo=mes), exatamente como foi
 * publicada (nunca recalculada). Um ponto por período; semanas e meses não se misturam.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scopeType = searchParams.get("scopeType");
  const scopeId = searchParams.get("scopeId");
  if (!scopeType || !scopeId) {
    return NextResponse.json({ error: "scopeType e scopeId são obrigatórios" }, { status: 400 });
  }

  try {
    const rows = await prisma.periodReport.findMany({
      where: { scopeType, scopeId, granularity: parseTipo(searchParams.get("tipo")) },
      orderBy: { periodStart: "asc" },
      select: { periodStart: true, periodEnd: true, qualidade: true, preliminar: true },
    });
    return NextResponse.json(
      rows.map((r) => {
        const q = r.qualidade as any;
        return {
          periodStart: r.periodStart.toISOString(),
          periodEnd: r.periodEnd.toISOString(),
          notaGeral: q?.notaGeral ?? null,
          n: q?.nComNota ?? q?.n ?? 0,
          preliminar: r.preliminar,
        };
      })
    );
  } catch {
    return NextResponse.json({ error: "Banco indisponível" }, { status: 503 });
  }
}
