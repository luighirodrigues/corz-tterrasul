import { prisma } from "../db/prisma.js";
import { isClosed, type Period } from "./period.js";

export interface GateInput {
  period: Period;
  now: Date;
  lastSessionsSync: Date | null; // startedAt do último SYNC_SESSIONS concluído
  lastCardsSync: Date | null; // idem SYNC_CARDS
  pendingAnalyses: number; // COMPLETED da janela sem done/skipped/error na versão atual
}

export interface GateResult {
  ok: boolean;
  problems: string[];
}

/** Regras do checklist §16 (PRD). Pura: não acessa banco. */
export function evaluateGate(input: GateInput): GateResult {
  const problems: string[] = [];
  const { period, now } = input;

  if (!isClosed(period, now)) {
    problems.push("A janela ainda está aberta.");
  }
  if (!input.lastSessionsSync || input.lastSessionsSync.getTime() <= period.end.getTime()) {
    problems.push("Sync de sessões não concluído depois do fim da janela (rode `sync`).");
  }
  if (!input.lastCardsSync || input.lastCardsSync.getTime() <= period.end.getTime()) {
    problems.push("Sync de cards não concluído depois do fim da janela (rode `cards`).");
  }
  if (input.pendingAnalyses > 0) {
    problems.push(
      `${input.pendingAnalyses} sessões COMPLETED da janela sem análise (rode \`stage1\`).`
    );
  }
  return { ok: problems.length === 0, problems };
}

export async function checkPublishGate(
  tenantId: string,
  period: Period,
  promptVersion: string,
  now: Date = new Date()
): Promise<GateResult> {
  const [sess, cards, pending] = await Promise.all([
    prisma.syncJob.findFirst({
      where: { tenantId, jobType: "SYNC_SESSIONS", status: "completed" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    prisma.syncJob.findFirst({
      where: { tenantId, jobType: "SYNC_CARDS", status: "completed" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
    prisma.session.count({
      where: {
        tenantId,
        status: "COMPLETED",
        endAt: { gte: period.start, lte: period.end },
        analyses: {
          none: { promptVersion, status: { in: ["done", "skipped", "error"] } },
        },
      },
    }),
  ]);

  return evaluateGate({
    period,
    now,
    lastSessionsSync: sess?.startedAt ?? null,
    lastCardsSync: cards?.startedAt ?? null,
    pendingAnalyses: pending,
  });
}
