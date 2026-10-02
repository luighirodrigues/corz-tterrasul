import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { computeSessionMetrics } from "../domain/session-metrics.js";

export interface MetricsOptions {
  tenantId?: string;
  /** Marca TODAS as conversas para recálculo antes de começar (backfill ou mudança na regra). */
  all?: boolean;
  batchSize?: number;
}

export interface MetricsResult {
  recalculated: number;
  /** Conversas que mudaram durante o cálculo e ficaram marcadas para a próxima rodada. */
  raced: number;
}

/**
 * Grava em cada conversa os indicadores que o Job C e as telas somam (TMR, sem resposta, reativação, FTR).
 * Usa a MESMA `computeSessionMetrics` de antes: o que muda é só onde o resultado fica guardado.
 *
 * Uma conversa só é recalculada quando o sync mexeu nela (`metricsStale`). Roda no fim do Job A e antes de
 * publicar relatório; sem nada marcado, não faz nada.
 */
export async function runJobMetrics(options: MetricsOptions = {}): Promise<MetricsResult> {
  const tenantId = options.tenantId || env.DEFAULT_TENANT_ID;
  const batchSize = options.batchSize ?? 500;

  if (options.all) {
    const n = await prisma.session.updateMany({ where: { tenantId }, data: { metricsStale: true } });
    console.log(`[Métricas] ${n.count} conversas marcadas para recálculo.`);
  }

  const result: MetricsResult = { recalculated: 0, raced: 0 };
  // Conversas que mudaram durante o cálculo continuam marcadas: não podem reentrar no mesmo laço.
  const skipIds = new Set<string>();

  for (;;) {
    const batch = await prisma.session.findMany({
      where: { tenantId, metricsStale: true, ...(skipIds.size ? { id: { notIn: [...skipIds] } } : {}) },
      select: {
        id: true,
        updatedAt: true,
        status: true,
        startAt: true,
        endAt: true,
        firstResponseAt: true,
        timeService: true,
        messages: {
          orderBy: { timestamp: "asc" },
          select: { timestamp: true, direction: true, origin: true, type: true, status: true },
        },
      },
      orderBy: { id: "asc" },
      take: batchSize,
    });
    if (batch.length === 0) break;

    for (const s of batch) {
      const m = computeSessionMetrics(s, s.messages);
      // `updatedAt` identifica a versão lida: se o sync mexer na conversa no meio do cálculo, nada é gravado
      // e ela segue marcada. Repassar o mesmo `updatedAt` impede que o próprio cálculo conte como mudança.
      const r = await prisma.session.updateMany({
        where: { id: s.id, updatedAt: s.updatedAt },
        data: {
          tmrSeconds: m.tmrSeconds,
          tmrFallback: m.tmrFromFallback,
          semResposta: m.semResposta,
          reativada: m.reativada,
          ftrSeconds: m.ftrSeconds,
          metricsStale: false,
          updatedAt: s.updatedAt,
        },
      });
      if (r.count === 0) {
        result.raced++;
        skipIds.add(s.id);
      } else {
        result.recalculated++;
      }
    }
    if (batch.length === batchSize) console.log(`[Métricas] ${result.recalculated} conversas recalculadas...`);
  }

  console.log(
    `[Métricas] Concluído: ${result.recalculated} conversas recalculadas${result.raced ? `, ${result.raced} alteradas durante o cálculo (ficam para a próxima rodada)` : ""}.`
  );
  return result;
}
