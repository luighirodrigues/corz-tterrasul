import { NextResponse } from "next/server";
import { authorizeApi } from "@/auth/dal";
import { env } from "@/config/env";
import { prisma } from "@/db/prisma";

export async function GET() {
  const auth = await authorizeApi("admin");
  if (auth instanceof Response) return auth;
  try {
    const [jobs, tenant, analysisCounts, envios, errosEnvio] = await Promise.all([
      prisma.syncJob.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
      prisma.tenant.findFirst({ select: { id: true, name: true, timezone: true, updatedAt: true } }),
      prisma.sessionAnalysis.groupBy({ by: ["status"], _count: { _all: true } }),
      // Resumos por e-mail: o que saiu em cada período e o que deu erro (só o administrador vê esta rota).
      prisma.summaryEmail.groupBy({ by: ["granularity", "periodStart", "status"], _count: { _all: true }, orderBy: { periodStart: "desc" }, take: 30 }),
      prisma.summaryEmail.findMany({
        where: { status: "erro" },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { id: true, toAddress: true, error: true, granularity: true, periodStart: true },
      }),
    ]);

    const periodos = new Map<string, { granularity: string; periodStart: string; enviados: number; erros: number }>();
    for (const e of envios) {
      const chave = `${e.granularity}|${e.periodStart.toISOString()}`;
      const p = periodos.get(chave) ?? { granularity: e.granularity, periodStart: e.periodStart.toISOString(), enviados: 0, erros: 0 };
      if (e.status === "enviado") p.enviados += e._count._all;
      else p.erros += e._count._all;
      periodos.set(chave, p);
    }

    return NextResponse.json({
      dbStatus: "online",
      tenant,
      recentJobs: jobs,
      analyses: Object.fromEntries(analysisCounts.map((c) => [c.status, c._count._all])),
      emails: {
        ligado: env.SMTP_HOST.trim() !== "",
        periodos: [...periodos.values()].slice(0, 8),
        erros: errosEnvio.map((e) => ({ id: e.id, email: e.toAddress, motivo: e.error, granularity: e.granularity, periodStart: e.periodStart.toISOString() })),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { dbStatus: "offline", error: "Banco indisponível", recentJobs: [], analyses: {}, emails: null },
      { status: 503 }
    );
  }
}
