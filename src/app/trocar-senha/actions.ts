"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/auth/dal";
import { hashPassword, validateNewPassword, verifyPassword } from "@/auth/password";
import { endAllSessions, endSession } from "@/auth/session";
import { prisma } from "@/db/prisma";

export type TrocaSenhaEstado = { erro?: string } | undefined;

export async function sair(): Promise<void> {
  await requireUser({ permitirProvisoria: true });
  await endSession();
  redirect("/login");
}

/** Primeiro acesso (senha provisória: não pede a atual) ou troca por vontade da pessoa (pede a atual). */
export async function trocarSenha(_estado: TrocaSenhaEstado, formData: FormData): Promise<TrocaSenhaEstado> {
  const sessao = await requireUser({ permitirProvisoria: true });
  const atual = String(formData.get("atual") ?? "");
  const nova = String(formData.get("nova") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  const user = await prisma.user.findUnique({ where: { id: sessao.id } });
  if (!user || user.deactivatedAt) redirect("/login");

  if (!user.mustChangePassword && !(await verifyPassword(atual, user.passwordHash))) return { erro: "A senha atual não confere." };

  const problema = validateNewPassword(nova, user.email);
  if (problema) return { erro: problema };
  if (nova !== confirmacao) return { erro: "A confirmação não é igual à nova senha." };
  if (await verifyPassword(nova, user.passwordHash)) return { erro: "Escolha uma senha diferente da atual." };

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(nova), mustChangePassword: false } });
  await endAllSessions(user.id, sessao.sessionId);
  redirect("/");
}
