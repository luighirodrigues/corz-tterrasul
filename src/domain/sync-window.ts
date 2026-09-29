import { prisma } from "../db/prisma.js";

export interface SyncWindowInput {
  now: Date;
  cursor: Date | null; // instante em que começou o último sync concluído
  goLiveAt: Date | null;
  fromDate?: string;
  lookbackDays?: number;
  all?: boolean;
  overlapMinutes: number;
}

export interface SyncWindow {
  mode: "incremental" | "backfill" | "full";
  createdAfter?: string; // backfill: CreatedAt.After
  updatedAfter?: string; // incremental: UpdatedAt.After
}

/**
 * Decide o que puxar da FLW:
 *  - `--all`: histórico completo;
 *  - `--from` / `--days`: backfill por data de criação;
 *  - senão, incremental por UpdatedAt desde o último sync concluído (com margem);
 *  - sem cursor: go-live; sem go-live: erro (não supõe 7 dias).
 */
export function resolveSyncWindow(i: SyncWindowInput): SyncWindow {
  if (i.all) return { mode: "full" };

  if (i.fromDate) {
    const d = new Date(i.fromDate);
    if (isNaN(d.getTime())) throw new Error(`Data inválida em --from: ${i.fromDate}`);
    return { mode: "backfill", createdAfter: d.toISOString() };
  }

  if (i.lookbackDays !== undefined) {
    const d = new Date(i.now.getTime() - i.lookbackDays * 24 * 3600 * 1000);
    return { mode: "backfill", createdAfter: d.toISOString() };
  }

  if (i.cursor) {
    return {
      mode: "incremental",
      updatedAfter: new Date(i.cursor.getTime() - i.overlapMinutes * 60 * 1000).toISOString(),
    };
  }

  if (i.goLiveAt) return { mode: "backfill", createdAfter: i.goLiveAt.toISOString() };

  throw new Error(
    "Sem cursor de sync anterior e sem GO_LIVE_AT. Rode a primeira carga com --from YYYY-MM-DD (ou --all)."
  );
}

/** Cursor = `cursorDate` do último job concluído que gravou `params` (jobs antigos, sem `params`, não valem). */
export async function getSyncCursor(tenantId: string, jobType: string): Promise<Date | null> {
  const jobs = await prisma.syncJob.findMany({
    where: { tenantId, jobType, status: "completed" },
    orderBy: { startedAt: "desc" },
    take: 20,
    select: { cursorDate: true, params: true },
  });
  return jobs.find((j) => j.params != null)?.cursorDate ?? null;
}
