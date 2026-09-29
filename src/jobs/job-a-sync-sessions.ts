import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { FlwClient } from "../flw/flw-client.js";
import { ensureTenant } from "../domain/tenant.js";

export interface SyncSessionsOptions {
  tenantId?: string;
  lookbackDays?: number;
  fromDate?: string;
  toDate?: string;
}

export async function runJobASyncSessions(options: SyncSessionsOptions = {}): Promise<void> {
  const tenantId = options.tenantId || env.DEFAULT_TENANT_ID;
  const client = new FlwClient();

  console.log(`[Job A] Iniciando sincronização de sessões para o tenant: ${tenantId}`);

  // 1. Garantir tenant atualizado a partir do .env
  await ensureTenant(tenantId);

  // 2. Sincronizar agentes
  try {
    const agents = await client.listAgents();
    console.log(`[Job A] Sincronizando ${agents.length} agentes da FLW...`);
    for (const agent of agents) {
      await prisma.agent.upsert({
        where: {
          tenantId_externalId: {
            tenantId,
            externalId: agent.id,
          },
        },
        update: {
          name: agent.name,
          email: agent.email || null,
          role: agent.role || null,
          active: agent.active ?? true,
        },
        create: {
          tenantId,
          externalId: agent.id,
          name: agent.name,
          email: agent.email || null,
          role: agent.role || null,
          active: agent.active ?? true,
        },
      });
    }
  } catch (err: any) {
    console.warn(`[Job A] Aviso ao sincronizar agentes: ${err.message}`);
  }

  // 3. Determinar janela de busca
  let createdAtAfter = options.fromDate;
  if (!createdAtAfter && options.lookbackDays) {
    const d = new Date();
    d.setDate(d.getDate() - options.lookbackDays);
    createdAtAfter = d.toISOString();
  }

  // 4. Criar checkpoint no banco
  const syncJob = await prisma.syncJob.create({
    data: {
      tenantId,
      jobType: "SYNC_SESSIONS",
      status: "running",
      startedAt: new Date(),
      cursorDate: createdAtAfter ? new Date(createdAtAfter) : null,
    },
  });

  let pageNumber = 1;
  let hasMore = true;
  let totalSeen = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  try {
    while (hasMore) {
      console.log(`[Job A] Buscando página ${pageNumber} de sessões...`);
      const response = await client.listSessions({
        pageNumber,
        pageSize: 100,
        createdAtAfter,
        createdAtBefore: options.toDate,
      });

      const sessions = response.items || response.data || [];
      totalSeen += sessions.length;

      for (let i = 0; i < sessions.length; i++) {
        const item = sessions[i];
        try {
function parseTimeToSeconds(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return Math.round(val);
  if (typeof val === "string") {
    const parts = val.split(":").map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    const num = parseInt(val, 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

          // Upsert sessão
          const sessionRecord = await prisma.session.upsert({
            where: {
              tenantId_externalId: {
                tenantId,
                externalId: item.id,
              },
            },
            update: {
              number: item.number != null ? String(item.number) : null,
              title: item.title ?? null,
              contactId: item.contactId ?? null,
              contactName: item.contactDetails?.name || null,
              contactNameWhatsapp: item.contactDetails?.nameWhatsapp || null,
              contactPhone: item.contactDetails?.phonenumber || null,
              channelId: item.channelId ?? null,
              channelType: item.channelType ?? null,
              agentExternalId: item.userId ?? null,
              agentName: item.agentDetails?.name || null,
              departmentId: item.departmentId ?? null,
              departmentName: item.departmentDetails?.name || null,
              status: item.status,
              startAt: item.startAt ? new Date(item.startAt) : null,
              firstResponseAt: item.firstResponseAt ? new Date(item.firstResponseAt) : null,
              endAt: item.endAt ? new Date(item.endAt) : null,
              lastInteractionDate: item.lastInteractionDate ? new Date(item.lastInteractionDate) : null,
              timeWait: parseTimeToSeconds(item.timeWait),
              timeService: parseTimeToSeconds(item.timeService),
              flwCreatedAt: item.createdAt ? new Date(item.createdAt) : null,
              flwUpdatedAt: item.updatedAt ? new Date(item.updatedAt) : null,
            },
            create: {
              tenantId,
              externalId: item.id,
              number: item.number != null ? String(item.number) : null,
              title: item.title ?? null,
              contactId: item.contactId ?? null,
              contactName: item.contactDetails?.name || null,
              contactNameWhatsapp: item.contactDetails?.nameWhatsapp || null,
              contactPhone: item.contactDetails?.phonenumber || null,
              channelId: item.channelId ?? null,
              channelType: item.channelType ?? null,
              agentExternalId: item.userId ?? null,
              agentName: item.agentDetails?.name || null,
              departmentId: item.departmentId ?? null,
              departmentName: item.departmentDetails?.name || null,
              status: item.status,
              startAt: item.startAt ? new Date(item.startAt) : null,
              firstResponseAt: item.firstResponseAt ? new Date(item.firstResponseAt) : null,
              endAt: item.endAt ? new Date(item.endAt) : null,
              lastInteractionDate: item.lastInteractionDate ? new Date(item.lastInteractionDate) : null,
              timeWait: parseTimeToSeconds(item.timeWait),
              timeService: parseTimeToSeconds(item.timeService),
              flwCreatedAt: item.createdAt ? new Date(item.createdAt) : null,
              flwUpdatedAt: item.updatedAt ? new Date(item.updatedAt) : null,
            },
          });

          // Buscar e persistir mensagens da sessão
          const messages = await client.listAllSessionMessages(item.id);
          if (messages.length > 0) {
            for (const msg of messages) {
              const msgTimestamp = msg.timestamp || msg.createdAt || new Date().toISOString();
              await prisma.message.upsert({
                where: {
                  tenantId_externalId: {
                    tenantId,
                    externalId: msg.id,
                  },
                },
                update: {
                  sessionId: sessionRecord.id,
                  timestamp: new Date(msgTimestamp),
                  direction: msg.direction || "FROM_HUB",
                  origin: msg.origin || "DEFAULT",
                  type: msg.type || "TEXT",
                  status: msg.status || null,
                  text: msg.text || null,
                  fileUrl: msg.details?.file?.publicUrl || null,
                  transcription: msg.details?.transcription?.text || null,
                  senderId: msg.senderId || msg.userId || null,
                },
                create: {
                  tenantId,
                  externalId: msg.id,
                  sessionId: sessionRecord.id,
                  timestamp: new Date(msgTimestamp),
                  direction: msg.direction || "FROM_HUB",
                  origin: msg.origin || "DEFAULT",
                  type: msg.type || "TEXT",
                  status: msg.status || null,
                  text: msg.text || null,
                  fileUrl: msg.details?.file?.publicUrl || null,
                  transcription: msg.details?.transcription?.text || null,
                  senderId: msg.senderId || msg.userId || null,
                },
              });
            }
          }

          totalSuccess++;
        } catch (err: any) {
          totalFailed++;
          console.error(`[Job A] Erro ao sincronizar sessão ${item.id}:`, err.message);
        }

        // Atualizar checkpoint da página periodicamente
        if (i % 20 === 0) {
          await prisma.syncJob.update({
            where: { id: syncJob.id },
            data: {
              currentPage: pageNumber,
              currentIndex: i,
              itemsSeen: totalSeen,
              itemsSuccess: totalSuccess,
              itemsFailed: totalFailed,
            },
          });
        }
      }

      hasMore = response.hasMorePages && sessions.length > 0;
      pageNumber++;
    }

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "completed",
        currentPage: pageNumber - 1,
        itemsSeen: totalSeen,
        itemsSuccess: totalSuccess,
        itemsFailed: totalFailed,
        finishedAt: new Date(),
      },
    });

    console.log(`[Job A] Concluído com sucesso: ${totalSuccess} sessões importadas (${totalFailed} falhas).`);
  } catch (fatalError: any) {
    console.error("[Job A] Erro fatal:", fatalError);
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "failed",
        errorMessage: fatalError.message,
        finishedAt: new Date(),
      },
    });
    throw fatalError;
  }
}
