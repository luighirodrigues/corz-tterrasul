import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { FlwClient } from "../flw/flw-client.js";

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

  // 1. Obter tenant e verificar IDs dos painéis
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error(`Tenant ${tenantId} não encontrado. Execute o Job A primeiro.`);
  }

  let { panelVendasId, panelCampanhasId, panelPecasId, panelOficinaId } = tenant;

  // Se algum ID não estiver configurado, buscar na API FLW
  if (!panelVendasId || !panelCampanhasId || !panelPecasId || !panelOficinaId) {
    try {
      const panels = await client.listPanels();
      console.log(`[Job B] Painéis encontrados na FLW (${panels.length}):`, panels.map((p) => `${p.title} (${p.id})`));

      for (const p of panels) {
        const titleLower = p.title.toLowerCase();
        if (!panelVendasId && titleLower.includes("venda") && !titleLower.includes("campanha")) {
          panelVendasId = p.id;
        } else if (!panelCampanhasId && (titleLower.includes("campanha") || titleLower.includes("anuncio"))) {
          panelCampanhasId = p.id;
        } else if (!panelPecasId && titleLower.includes("peça") || titleLower.includes("peca")) {
          panelPecasId = p.id;
        } else if (!panelOficinaId && (titleLower.includes("oficina") || titleLower.includes("serviço") || titleLower.includes("servico"))) {
          panelOficinaId = p.id;
        }
      }

      // Atualizar tenant com os IDs encontrados
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          panelVendasId: panelVendasId || null,
          panelCampanhasId: panelCampanhasId || null,
          panelPecasId: panelPecasId || null,
          panelOficinaId: panelOficinaId || null,
        },
      });
    } catch (err: any) {
      console.warn(`[Job B] Não foi possível resolver painéis automaticamente: ${err.message}`);
    }
  }

  const panelsToSync = [
    { name: "Vendas", id: panelVendasId },
    { name: "Campanhas", id: panelCampanhasId },
    { name: "Peças", id: panelPecasId },
    { name: "Oficina", id: panelOficinaId },
  ].filter((p): p is { name: string; id: string } => !!p.id);

  if (panelsToSync.length === 0) {
    console.warn("[Job B] Nenhum ID de painel CRM configurado para sincronizar.");
    return;
  }

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
