"use server";

import { redirect } from "next/navigation";
import { BLOQUEIO_MINUTOS, TENTATIVAS_MAXIMAS, caminhoSeguro } from "@/auth/rules";
import { hashPassword, verifyPassword } from "@/auth/password";
import { createSession } from "@/auth/session";
import { prisma } from "@/db/prisma";

export type LoginEstado = { erro?: string; email?: string } | undefined;

const ERRO = "E-mail ou senha incorretos.";
const BLOQUEADO = `Muitas tentativas. Tente de novo em ${BLOQUEIO_MINUTOS} minutos.`;
const DESATIVADO = "Seu acesso está desativado. Fale com o administrador.";

// Para e-mail inexistente também gastar o tempo de conferir uma senha: o tempo de resposta não revela quem tem cadastro.
let hashFalso: Promise<string> | null = null;
const umHashFalso = () => (hashFalso ??= hashPassword("senha-que-ninguem-tem"));

/**
 * Gasta uma das tentativas **antes** de conferir a senha, numa instrução só. Assim, pedidos simultâneos não passam
 * todos pela checagem do bloqueio antes de algum deles contar o erro: cada um gasta a sua, e a última já deixa o
 * e-mail bloqueado (se ela acertar a senha, o acerto desbloqueia). Um bloqueio vencido recomeça a conta.
 * Devolve null se o e-mail está bloqueado, ou se esta tentativa foi a que bloqueou.
 *
 * As datas são comparadas em UTC porque é assim que o Prisma grava as colunas `timestamp` sem fuso.
 */
async function gastarTentativa(userId: string): Promise<{ bloqueou: boolean } | null> {
  const linhas = await prisma.$queryRaw<Array<{ bloqueou: boolean }>>`
    UPDATE "users" SET
      "failed_logins" = CASE WHEN "locked_until" IS NULL THEN "failed_logins" + 1 ELSE 1 END,
      "locked_until" = CASE
        WHEN (CASE WHEN "locked_until" IS NULL THEN "failed_logins" + 1 ELSE 1 END) >= ${TENTATIVAS_MAXIMAS}::int
        THEN (now() AT TIME ZONE 'UTC') + ${BLOQUEIO_MINUTOS}::int * interval '1 minute'
        ELSE NULL
      END
    WHERE "id" = ${userId} AND ("locked_until" IS NULL OR "locked_until" <= (now() AT TIME ZONE 'UTC'))
    RETURNING ("locked_until" IS NOT NULL) AS "bloqueou"`;
  return linhas[0] ?? null;
}

/** Entrar é a única ação aberta a quem não tem sessão (por isso não chama `requireUser`). */
export async function entrar(_estado: LoginEstado, formData: FormData): Promise<LoginEstado> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const senha = String(formData.get("senha") ?? "");
  const volta = caminhoSeguro(String(formData.get("volta") ?? ""));
  if (!email || !senha) return { erro: ERRO, email };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await verifyPassword(senha, await umHashFalso());
    return { erro: ERRO, email };
  }

  // Bloqueado: nem confere a senha.
  const tentativa = await gastarTentativa(user.id);
  if (!tentativa) return { erro: BLOQUEADO, email };

  if (!(await verifyPassword(senha, user.passwordHash))) return { erro: tentativa.bloqueou ? BLOQUEADO : ERRO, email };

  // Senha certa zera a conta, até para quem está desativado (senão ele acabaria vendo "Muitas tentativas").
  const agora = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, ...(user.deactivatedAt ? {} : { lastSeenAt: agora }) },
  });

  // Só quem sabe a senha descobre que o acesso foi desativado.
  if (user.deactivatedAt) return { erro: DESATIVADO, email };

  await createSession(user.id);
  redirect(volta);
}
