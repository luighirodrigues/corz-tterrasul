import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";

export async function GET() {
  try {
    const [jobs, tenant, analysisCounts] = await Promise.all([
      prisma.syncJob.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
      prisma.tenant.findFirst({ select: { id: true, name: true, timezone: true, updatedAt: true } }),
      prisma.sessionAnalysis.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    return NextResponse.json({
      dbStatus: "online",
      tenant,
      recentJobs: jobs,
      analyses: Object.fromEntries(analysisCounts.map((c) => [c.status, c._count._all])),
    });
  } catch (error: any) {
    return NextResponse.json(
      { dbStatus: "offline", error: "Banco indisponível", recentJobs: [], analyses: {} },
      { status: 503 }
    );
  }
}
