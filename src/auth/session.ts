import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/db/prisma";
import { SESSION_COOKIE, SESSION_DAYS, sessionCookieOptions } from "./constants";

const DIA_MS = 24 * 3600 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  mustChangePassword: boolean;
  sessionId: string;
}

/** Abre a sessão: o cookie leva só um código aleatório, e o banco guarda o hash dele. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const agora = new Date();
  await prisma.userSession.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(agora.getTime() + SESSION_DAYS * DIA_MS) },
  });
  // Faxina das sessões vencidas, já que toda entrada passa por aqui.
  await prisma.userSession.deleteMany({ where: { expiresAt: { lt: agora } } });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
}

/**
 * O usuário da sessão do cookie, ou null (sem cookie, sessão vencida ou usuário desativado).
 * Uma consulta por requisição. Renova o prazo no máximo uma vez por dia.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const agora = new Date();
  const sessao = await prisma.userSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!sessao || sessao.expiresAt <= agora || sessao.user.deactivatedAt) return null;

  if (agora.getTime() - sessao.lastSeenAt.getTime() > DIA_MS) {
    await prisma.$transaction([
      prisma.userSession.update({
        where: { id: sessao.id },
        data: { lastSeenAt: agora, expiresAt: new Date(agora.getTime() + SESSION_DAYS * DIA_MS) },
      }),
      prisma.user.update({ where: { id: sessao.userId }, data: { lastSeenAt: agora } }),
    ]);
  }

  const { user } = sessao;
  return { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword, sessionId: sessao.id };
});

/** Sai neste navegador: apaga a sessão no banco e o cookie. */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.userSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** Derruba todas as sessões da pessoa (desativar, senha provisória, troca de senha), menos a `exceto`. */
export async function endAllSessions(userId: string, exceto?: string): Promise<void> {
  await prisma.userSession.deleteMany({ where: { userId, ...(exceto ? { id: { not: exceto } } : {}) } });
}
