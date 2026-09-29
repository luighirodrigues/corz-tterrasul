import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";

/**
 * Série histórica: a nota OFICIAL de cada semana, exatamente como foi publicada
 * (nunca recalculada). Um ponto por semana.
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
      where: { scopeType, scopeId },
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
