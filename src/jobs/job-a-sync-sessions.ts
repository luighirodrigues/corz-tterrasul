import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { FlwClient } from "../flw/flw-client.js";
import type { FlwMessageDTO, FlwSessionDTO } from "../flw/flw-types.js";
import { ensureTenant } from "../domain/tenant.js";
import { getSyncCursor, resolveSyncWindow } from "../domain/sync-window.js";
import { assignTeamGroups, parseIgnoredTeams, parseTeamGroups } from "../domain/teams.js";

export interface SyncSessionsOptions {
  tenantId?: string;
  lookbackDays?: number;
  fromDate?: string;
  toDate?: string;
  all?: boolean;
  /** Retoma o último job falho/interrompido do mesmo tipo (mesmos parâmetros). */
  resume?: boolean;
}

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

const toDate = (v?: string | null) => (v ? new Date(v) : null);

function sessionData(item: FlwSessionDTO) {
  return {
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
    sessionType: item.type ?? null,
    startAt: toDate(item.startAt),
    firstResponseAt: toDate(item.firstResponseAt),
    endAt: toDate(item.endAt),
    lastInteractionDate: toDate(item.lastInteractionDate),
    lastMessageIn: toDate(item.lastMessageIn),
    lastMessageOut: toDate(item.lastMessageOut),
    timeWait: parseTimeToSeconds(item.timeWait),
    timeService: parseTimeToSeconds(item.timeService),
    flwCreatedAt: toDate(item.createdAt),
    flwUpdatedAt: toDate(item.updatedAt),
  };
}

function messageData(msg: FlwMessageDTO, timestamp: Date) {
  return {
    timestamp,
    direction: msg.direction || "FROM_HUB",
    origin: msg.origin || "DEFAULT",
    type: msg.type || "TEXT",
    status: msg.status || null,
    text: msg.text || null,
    fileUrl: msg.details?.file?.publicUrl || null,
    transcription: msg.details?.transcription?.text || null,
    senderId: msg.senderId || msg.userId || null,
  };
}

/** Grava só o delta das mensagens da sessão. Devolve se alguma transcrição de áudio ainda está processando. */
async function syncMessages(
  client: FlwClient,
  tenantId: string,
  sessionId: string,
  externalSessionId: string
): Promise<{ audioProcessing: boolean; skippedNoTimestamp: number }> {
  const messages = await client.listAllSessionMessages(externalSessionId);
  const existing = await prisma.message.findMany({
    where: { tenantId, sessionId },
    select: { externalId: true },
  });
  const known = new Set(existing.map((m) => m.externalId));

  let audioProcessing = false;
  let skippedNoTimestamp = 0;
  const toCreate: any[] = [];

  for (const msg of messages) {
    const ts = msg.timestamp || msg.createdAt;
    if (!ts) {
      // Nunca inventar data: mensagem sem timestamp corromperia a timeline.
      skippedNoTimestamp++;
      continue;
    }
    if (msg.details?.transcription?.processing) audioProcessing = true;

    const data = messageData(msg, new Date(ts));
    if (!known.has(msg.id)) {
      toCreate.push({ tenantId, externalId: msg.id, sessionId, ...data });
    } else if (msg.type === "AUDIO") {
      // A transcrição pode chegar depois da mensagem.
      await prisma.message.update({
        where: { tenantId_externalId: { tenantId, externalId: msg.id } },
        data: { transcription: data.transcription, status: data.status },
      });
    }
  }

  if (toCreate.length) await prisma.message.createMany({ data: toCreate, skipDuplicates: true });
  return { audioProcessing, skippedNoTimestamp };
}

export async function runJobASyncSessions(options: SyncSessionsOptions = {}): Promise<void> {
  const tenantId = options.tenantId || env.DEFAULT_TENANT_ID;
  const runStartedAt = new Date();

  console.log(`[Job A] Iniciando sincronização de sessões para o tenant: ${tenantId}`);

  // 1. Tenant atualizado a partir do .env
  const tenant = await ensureTenant(tenantId);
  const client = new FlwClient({ token: tenant.token || undefined });

  // 2. Agentes
  try {
    const agents = await client.listAgents();
    console.log(`[Job A] Sincronizando ${agents.length} agentes da FLW...`);
    for (const agent of agents) {
      const data = {
        name: agent.name,
        email: agent.email || null,
        role: agent.role || null,
        active: agent.active ?? true,
      };
      await prisma.agent.upsert({
        where: { tenantId_externalId: { tenantId, externalId: agent.id } },
        update: data,
        create: { tenantId, externalId: agent.id, ...data },
      });
    }
  } catch (err: any) {
    console.warn(`[Job A] Aviso ao sincronizar agentes: ${err.message}`);
  }

  // 2b. Equipes. Equipe apagada na FLW não é apagada aqui: conversas antigas apontam para ela.
  try {
    const departments = await client.listDepartments();
    for (const dep of departments) {
      const data = { name: dep.name, isDefault: dep.isDefault ?? false };
      await prisma.department.upsert({
        where: { tenantId_externalId: { tenantId, externalId: dep.id } },
        update: data,
        create: { tenantId, externalId: dep.id, ...data },
      });
    }
    const groups = parseTeamGroups(tenant.teamGroups);
    if (groups.length > 0) {
      const a = assignTeamGroups(departments, groups, parseIgnoredTeams(tenant.ignoredTeams));
      console.log(
        `[Job A] Equipes: ${groups.map((g) => `${g.name} (${a.idsByGroup.get(g.name)!.length} da FLW)`).join(", ")}`,
      );
      if (a.unmapped.length) console.warn(`[Job A] Equipes da FLW sem grupo: ${a.unmapped.map((t) => t.name).join(", ")}`);
      if (a.missing.length) console.warn(`[Job A] Nomes do TEAM_GROUPS que não existem na FLW: ${a.missing.join(", ")}`);
    } else {
      console.log(`[Job A] ${departments.length} equipes da FLW sincronizadas (TEAM_GROUPS vazio: relatório por equipe desligado).`);
    }
  } catch (err: any) {
    console.warn(`[Job A] Aviso ao sincronizar equipes: ${err.message}`);
  }

  // 3. Janela: retomar job anterior ou decidir (incremental / backfill / full)
  let window: ReturnType<typeof resolveSyncWindow>;
  let startPage = 1;
  let resumedJobId: string | null = null;

  if (options.resume) {
    const candidates = await prisma.syncJob.findMany({
      where: { tenantId, jobType: "SYNC_SESSIONS", status: { in: ["failed", "running"] } },
      orderBy: { startedAt: "desc" },
      take: 20,
    });
    const last = candidates.find((j) => j.params != null);
    if (!last) throw new Error("Nada para retomar: nenhum job SYNC_SESSIONS falho ou interrompido.");
    window = (last.params as any).window;
    startPage = Math.max(1, last.currentPage);
    resumedJobId = last.id;
    console.log(`[Job A] Retomando o job ${last.id} da página ${startPage}.`);
  } else {
    window = resolveSyncWindow({
      now: runStartedAt,
      cursor: await getSyncCursor(tenantId, "SYNC_SESSIONS"),
      goLiveAt: tenant.goLiveAt,
      fromDate: options.fromDate,
      lookbackDays: options.lookbackDays,
      all: options.all,
      overlapMinutes: env.SYNC_OVERLAP_MINUTES,
    });
  }
  console.log(`[Job A] Modo: ${window.mode}${window.updatedAfter ? ` (UpdatedAt.After=${window.updatedAfter})` : ""}${window.createdAfter ? ` (CreatedAt.After=${window.createdAfter})` : ""}`);

  const syncJob = resumedJobId
    ? await prisma.syncJob.update({ where: { id: resumedJobId }, data: { status: "running", errorMessage: null } })
    : await prisma.syncJob.create({
        data: {
          tenantId,
          jobType: "SYNC_SESSIONS",
          status: "running",
          startedAt: runStartedAt,
          cursorDate: runStartedAt, // só vale como cursor quando o job termina "completed"
          params: { window } as any,
        },
      });

  let pageNumber = startPage;
  let hasMore = true;
  let totalSeen = syncJob.itemsSeen;
  let totalSuccess = syncJob.itemsSuccess;
  let totalFailed = syncJob.itemsFailed;
  let messagesFetched = 0;

  try {
    while (hasMore) {
      console.log(`[Job A] Buscando página ${pageNumber} de sessões...`);
      const response = await client.listSessions({
        pageNumber,
        pageSize: 100,
        createdAtAfter: window.createdAfter,
        createdAtBefore: options.toDate,
        updatedAtAfter: window.updatedAfter,
      });

      const sessions = response.items || response.data || [];
      totalSeen += sessions.length;

      for (const item of sessions) {
        try {
          const data = sessionData(item);
          const existing = await prisma.session.findUnique({
            where: { tenantId_externalId: { tenantId, externalId: item.id } },
            select: { id: true, messagesSyncedFlwUpdatedAt: true, messagesPending: true },
          });

          const record = await prisma.session.upsert({
            where: { tenantId_externalId: { tenantId, externalId: item.id } },
            update: data,
            create: { tenantId, externalId: item.id, ...data },
          });

          const flwUpdated = data.flwUpdatedAt;
          const needMessages =
            !existing ||
            existing.messagesPending ||
            !existing.messagesSyncedFlwUpdatedAt ||
            (flwUpdated && flwUpdated > existing.messagesSyncedFlwUpdatedAt);

          if (needMessages) {
            const r = await syncMessages(client, tenantId, record.id, item.id);
            messagesFetched++;
            if (r.skippedNoTimestamp) {
              console.warn(`[Job A] Sessão ${item.id}: ${r.skippedNoTimestamp} mensagens sem timestamp ignoradas.`);
            }
            await prisma.session.update({
              where: { id: record.id },
              data: {
                messagesSyncedAt: new Date(),
                messagesSyncedFlwUpdatedAt: flwUpdated ?? new Date(),
                messagesPending: r.audioProcessing,
              },
            });
          }

          totalSuccess++;
        } catch (err: any) {
          totalFailed++;
          console.error(`[Job A] Erro ao sincronizar sessão ${item.id}:`, err.message);
        }
      }

      hasMore = response.hasMorePages && sessions.length > 0;
      pageNumber++;

      // Checkpoint ao fim de cada página: a próxima página a buscar
      await prisma.syncJob.update({
        where: { id: syncJob.id },
        data: {
          currentPage: hasMore ? pageNumber : pageNumber - 1,
          itemsSeen: totalSeen,
          itemsSuccess: totalSuccess,
          itemsFailed: totalFailed,
        },
      });
    }

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: { status: "completed", finishedAt: new Date() },
    });

    console.log(
      `[Job A] Concluído: ${totalSuccess} sessões (${totalFailed} falhas); mensagens baixadas para ${messagesFetched} sessões.`
    );
  } catch (fatalError: any) {
    console.error("[Job A] Erro fatal:", fatalError);
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: { status: "failed", errorMessage: fatalError.message, finishedAt: new Date() },
    });
    throw fatalError;
  }
}
