import { prisma } from "../db/prisma.js";
import { generateTemporaryPassword, hashPassword, validateNewPassword } from "./password.js";

export interface AdminResultado {
  criado: boolean;
  email: string;
  nome: string;
  /** Só quando a senha é provisória (sem `--senha`). */
  senhaProvisoria?: string;
}

/**
 * `pnpm user:admin`: cria o administrador, ou, se o e-mail já existe, o torna administrador, reativa, gera outra
 * senha, desbloqueia e encerra as sessões. Serve para o primeiro acesso e para recuperar o acesso.
 * Com `senha`, grava uma senha definitiva (sem troca obrigatória): é para o ambiente de desenvolvimento.
 */
export async function ensureAdmin(opcoes: { email: string; nome?: string; senha?: string }): Promise<AdminResultado> {
  const email = opcoes.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`E-mail inválido: ${opcoes.email}`);
  if (opcoes.senha) {
    const problema = validateNewPassword(opcoes.senha, email);
    if (problema) throw new Error(problema);
  }

  const senhaProvisoria = opcoes.senha ? undefined : generateTemporaryPassword();
  const passwordHash = await hashPassword(opcoes.senha ?? (senhaProvisoria as string));
  const mustChangePassword = !opcoes.senha;

  const existente = await prisma.user.findUnique({ where: { email } });
  if (!existente) {
    if (!opcoes.nome?.trim()) throw new Error('Informe o nome: --nome "Fulano".');
    const nome = opcoes.nome.trim();
    await prisma.user.create({ data: { email, name: nome, role: "admin", passwordHash, mustChangePassword } });
    return { criado: true, email, nome, senhaProvisoria };
  }

  const nome = opcoes.nome?.trim() || existente.name;
  await prisma.user.update({
    where: { id: existente.id },
    data: { name: nome, role: "admin", deactivatedAt: null, passwordHash, mustChangePassword, failedLogins: 0, lockedUntil: null },
  });
  await prisma.userSession.deleteMany({ where: { userId: existente.id } });
  return { criado: false, email, nome, senhaProvisoria };
}
