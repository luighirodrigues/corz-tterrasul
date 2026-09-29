import { prisma } from "../db/prisma.js";

/**
 * Impede duas execuções simultâneas (chamadas duplicadas à FLW e à OpenAI).
 * Usa lock consultivo do Postgres preso a uma transação; se outra instância já roda, falha rápido.
 */
export async function withAdvisoryLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${name})) AS locked`;
      if (!rows[0]?.locked) {
        throw new Error(`Outra execução ("${name}") já está em andamento. Aguarde ela terminar.`);
      }
      return fn();
    },
    { timeout: 12 * 3600 * 1000, maxWait: 10_000 }
  );
}
