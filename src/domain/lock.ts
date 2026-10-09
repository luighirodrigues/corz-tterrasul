import { prisma } from "../db/prisma";

/** A trava dos comandos de dados (`src/cli.ts`). Alcançado pela tela (disparo por HTTP): importa sem `.js`. */
export const TRAVA_JOBS = "flw-quality";

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

/** Se alguém está com a trava agora. Pega e solta na mesma transação curta, então não segura nada. */
export async function travaOcupada(name: string): Promise<boolean> {
  const rows = await prisma.$transaction((tx) =>
    tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${name})) AS locked`
  );
  return !rows[0]?.locked;
}
