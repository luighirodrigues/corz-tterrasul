import { prisma } from "@/db/prisma";

/** Quando terminou o último sync de conversas (ISO), para o "Atualizado…" do painel. Null se não houver ou o banco falhar. */
export async function loadLastSyncAt(): Promise<string | null> {
  try {
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    if (!tenant) return null;
    const job = await prisma.syncJob.findFirst({
      where: { tenantId: tenant.id, jobType: "SYNC_SESSIONS", status: "completed" },
      orderBy: { startedAt: "desc" },
      select: { finishedAt: true },
    });
    return job?.finishedAt?.toISOString() ?? null;
  } catch {
    return null;
  }
}
