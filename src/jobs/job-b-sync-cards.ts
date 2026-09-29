import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { FlwClient } from "../flw/flw-client.js";
import type { FlwPanelCardDTO } from "../flw/flw-types.js";
import { ensureTenant, panelConfigFromEnv } from "../domain/tenant.js";
import { resolvePanelIds, type PanelKey } from "../domain/panels.js";
import { getSyncCursor, resolveSyncWindow } from "../domain/sync-window.js";

export interface SyncCardsOptions {
  tenantId?: string;
  lookbackDays?: number;
  fromDate?: string;
  toDate?: string;
  all?: boolean;
  statuses?: string[];
}

/** O card pode trazer o motivo de perda como objeto ({id,name}) ou como texto. */
export function parseLostReason(v: FlwPanelCardDTO["lostReason"]): { id: string | null; name: string | null } {
  if (!v) return { id: null, name: null };
  if (typeof v === "string") return { id: null, name: v };
  return { id: v.id ?? null, name: v.name ?? null };
}

export async function runJobBSyncCards(options: SyncCardsOptions = {}): Promise<void> {
  const tenantId = options.tenantId || env.DEFAULT_TENANT_ID;
  const runStartedAt = new Date();
  const statuses = options.statuses || ["OPEN", "WON", "LOST"];

  console.log(`[Job B] Iniciando sincronização dos painéis CRM para o tenant: ${tenantId}`);

  // 1. Tenant atualizado a partir do .env e IDs dos 4 painéis (ID configurado > título exato)
  const tenant = await ensureTenant(tenantId);
  const client = new FlwClient({ token: tenant.token || undefined });

  const panelKeys = [
    { key: "vendas", name: "Vendas", current: tenant.panelVendasId },
    { key: "campanhas", name: "Campanhas", current: tenant.panelCampanhasId },
    { key: "pecas", name: "Peças", current: tenant.panelPecasId },
    { key: "oficina", name: "Oficina", current: tenant.panelOficinaId },
  ] as const;

  let resolved: Record<PanelKey, string>;
  if (panelKeys.every((p) => p.current)) {
    resolved = Object.fromEntries(panelKeys.map((p) => [p.key, p.current as string])) as Record<PanelKey, string>;
  } else {
    const panels = await client.listPanels();
    console.log(`[Job B] Painéis na FLW (${panels.length}):`, panels.map((p) => `${p.title} (${p.id})`));
    const cfg = panelConfigFromEnv();
    for (const p of panelKeys) if (p.current) cfg.ids[p.key] = p.current;
    resolved = resolvePanelIds(panels, cfg); // lança com a lista de painéis se não achar
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        panelVendasId: resolved.vendas,
        panelCampanhasId: resolved.campanhas,
        panelPecasId: resolved.pecas,
        panelOficinaId: resolved.oficina,
      },
    });
  }

  const panelsToSync = panelKeys.map((p) => ({ name: p.name, id: resolved[p.key] }));

  // 2. Janela: incremental por UpdatedAt (um card criado há meses que virou WON hoje entra)
  const window = resolveSyncWindow({
    now: runStartedAt,
    cursor: await getSyncCursor(tenantId, "SYNC_CARDS"),
    goLiveAt: tenant.goLiveAt,
    fromDate: options.fromDate,
    lookbackDays: options.lookbackDays,
    all: options.all,
    overlapMinutes: env.SYNC_OVERLAP_MINUTES,
  });
  console.log(
    `[Job B] Modo: ${window.mode} | Statuses=[${statuses.join(", ")}]${window.updatedAfter ? ` | UpdatedAt.After=${window.updatedAfter}` : ""}${window.createdAfter ? ` | CreatedAt.After=${window.createdAfter}` : ""}`
  );

  const syncJob = await prisma.syncJob.create({
    data: {
      tenantId,
      jobType: "SYNC_CARDS",
      status: "running",
      startedAt: runStartedAt,
      cursorDate: runStartedAt,
      params: { window } as any,
    },
  });

  let totalImported = 0;
  const sessionsWithMultipleCards = new Set<string>();

  try {
    for (const panel of panelsToSync) {
      console.log(`[Job B] Sincronizando cards do painel '${panel.name}' (${panel.id})...`);
      const cards = await client.listAllPanelCards(panel.id, {
        statuses,
        createdAtAfter: window.createdAfter,
        createdAtBefore: options.toDate,
        updatedAtAfter: window.updatedAfter,
      });
      console.log(`[Job B] ${cards.length} cards encontrados no painel '${panel.name}'.`);

      for (const card of cards) {
        let internalSessionId: string | null = null;
        if (card.sessionId) {
          const session = await prisma.session.findUnique({
            where: { tenantId_externalId: { tenantId, externalId: card.sessionId } },
            select: { id: true },
          });
          internalSessionId = session?.id || null;
        }

        const lost = parseLostReason(card.lostReason);
        const data = {
          panelId: card.panelId || panel.id,
          panelTitle: card.panelTitle || panel.name,
          stepId: card.stepId || null,
          stepTitle: card.stepTitle || null,
          stepPhase: card.stepPhase || null,
          status: card.status,
          lostReason: lost.name,
          lostReasonId: lost.id,
          responsibleUserId: card.responsibleUserId || null,
          sessionExternalId: card.sessionId || null,
          sessionId: internalSessionId,
          flwCreatedAt: card.createdAt ? new Date(card.createdAt) : null,
          flwUpdatedAt: card.updatedAt ? new Date(card.updatedAt) : null,
        };

        await prisma.panelCard.upsert({
          where: { tenantId_externalId: { tenantId, externalId: card.id } },
          update: data,
          create: { tenantId, externalId: card.id, ...data },
        });
        totalImported++;
      }

      await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: { itemsSeen: { increment: cards.length }, itemsSuccess: totalImported },
      });
    }

    // 3. Religar cards que chegaram antes da sessão existir no espelho
    const relinked = await prisma.$executeRaw`
      UPDATE panel_cards pc SET session_id = s.id
      FROM sessions s
      WHERE pc.tenant_id = ${tenantId}
        AND s.tenant_id = pc.tenant_id
        AND pc.session_external_id = s.external_id
        AND pc.session_id IS NULL`;
    if (relinked) console.log(`[Job B] ${relinked} cards religados a sessões já existentes.`);

    // 4. Sessões com mais de um card (deveria ser raro): só registra; a escolha é feita na leitura
    const dupes = await prisma.$queryRaw<Array<{ session_external_id: string; n: bigint }>>`
      SELECT session_external_id, COUNT(*) AS n FROM panel_cards
      WHERE tenant_id = ${tenantId} AND session_external_id IS NOT NULL
      GROUP BY session_external_id HAVING COUNT(*) > 1`;
    for (const d of dupes) sessionsWithMultipleCards.add(d.session_external_id);
    if (sessionsWithMultipleCards.size) {
      console.warn(`[Job B] ${sessionsWithMultipleCards.size} sessões com mais de um card; será usado o mais recente.`);
    }

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: { status: "completed", itemsSuccess: totalImported, finishedAt: new Date() },
    });

    console.log(`[Job B] Sincronização de cards concluída: ${totalImported} cards processados.`);
  } catch (error: any) {
    console.error("[Job B] Erro fatal ao sincronizar cards:", error);
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: { status: "failed", errorMessage: error.message, finishedAt: new Date() },
    });
    throw error;
  }
}
