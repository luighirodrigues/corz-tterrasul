import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { FlwClient } from "../flw/flw-client.js";
import { ensureTenant, panelConfigFromEnv } from "../domain/tenant.js";
import { resolvePanelIds, type PanelKey } from "../domain/panels.js";

export interface SyncCardsOptions {
  tenantId?: string;
  lookbackDays?: number;
  fromDate?: string;
  toDate?: string;
  statuses?: string[];
}

export async function runJobBSyncCards(options: SyncCardsOptions = {}): Promise<void> {
  const tenantId = options.tenantId || env.DEFAULT_TENANT_ID;
  const client = new FlwClient();

  // Determinar range de datas para busca
  let createdAtAfter: string | undefined = options.fromDate;
  if (!createdAtAfter && options.lookbackDays !== undefined) {
    const d = new Date();
    d.setDate(d.getDate() - options.lookbackDays);
    createdAtAfter = d.toISOString();
  }
  const createdAtBefore = options.toDate;
  const statuses = options.statuses || ["OPEN", "WON", "LOST"];

  console.log(`[Job B] Iniciando sincronização dos painéis CRM para o tenant: ${tenantId}`);
  console.log(
    `[Job B] Filtro aplicado: Statuses=[${statuses.join(", ")}]${
      createdAtAfter ? ` | CreatedAt.After=${createdAtAfter}` : ""
    }${createdAtBefore ? ` | CreatedAt.Before=${createdAtBefore}` : ""}`
  );

  // 1. Tenant atualizado a partir do .env e IDs dos 4 painéis (ID configurado > título exato)
  const tenant = await ensureTenant(tenantId);

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

  const syncJob = await prisma.syncJob.create({
    data: {
      tenantId,
      jobType: "SYNC_CARDS",
      status: "running",
      startedAt: new Date(),
      cursorDate: createdAtAfter ? new Date(createdAtAfter) : null,
    },
  });

  let totalImported = 0;

  try {
    for (const panel of panelsToSync) {
      console.log(`[Job B] Sincronizando cards do painel '${panel.name}' (${panel.id})...`);
      const cards = await client.listAllPanelCards(panel.id, {
        statuses,
        createdAtAfter,
        createdAtBefore,
      });
      console.log(`[Job B] ${cards.length} cards encontrados no painel '${panel.name}'.`);

      for (const card of cards) {
        // Tentar resolver vínculo com sessão interna se existir
        let internalSessionId: string | null = null;
        if (card.sessionId) {
          const session = await prisma.session.findUnique({
            where: {
              tenantId_externalId: {
                tenantId,
                externalId: card.sessionId,
              },
            },
            select: { id: true },
          });
          internalSessionId = session?.id || null;
        }

        const lostReasonText =
          typeof card.lostReason === "object" && card.lostReason !== null
            ? (card.lostReason as any).name || null
            : typeof card.lostReason === "string"
              ? card.lostReason
              : null;

        await prisma.panelCard.upsert({
          where: {
            tenantId_externalId: {
              tenantId,
              externalId: card.id,
            },
          },
          update: {
            panelId: card.panelId,
            stepId: card.stepId || null,
            stepTitle: card.stepTitle || null,
            status: card.status,
            lostReason: lostReasonText,
            responsibleUserId: card.responsibleUserId || null,
            sessionExternalId: card.sessionId || null,
            sessionId: internalSessionId,
            flwCreatedAt: card.createdAt ? new Date(card.createdAt) : null,
            flwUpdatedAt: card.updatedAt ? new Date(card.updatedAt) : null,
          },
          create: {
            tenantId,
            externalId: card.id,
            panelId: card.panelId,
            stepId: card.stepId || null,
            stepTitle: card.stepTitle || null,
            status: card.status,
            lostReason: lostReasonText,
            responsibleUserId: card.responsibleUserId || null,
            sessionExternalId: card.sessionId || null,
            sessionId: internalSessionId,
            flwCreatedAt: card.createdAt ? new Date(card.createdAt) : null,
            flwUpdatedAt: card.updatedAt ? new Date(card.updatedAt) : null,
          },
        });

        totalImported++;
      }
    }

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "completed",
        itemsSuccess: totalImported,
        finishedAt: new Date(),
      },
    });

    console.log(`[Job B] Sincronização de cards concluída: ${totalImported} cards processados.`);
  } catch (error: any) {
    console.error("[Job B] Erro fatal ao sincronizar cards:", error);
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "failed",
        errorMessage: error.message,
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}
