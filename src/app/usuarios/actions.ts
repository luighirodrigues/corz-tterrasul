"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/auth/dal";
import { generateTemporaryPassword, hashPassword } from "@/auth/password";
import { motivoNaoDesativar, motivoNaoMudarPerfil, type Perfil } from "@/auth/rules";
import { endAllSessions } from "@/auth/session";
import { env } from "@/config/env";
import { prisma } from "@/db/prisma";
import { chaveEscopo } from "@/domain/report-scopes";
import { FREQUENCIAS, type Frequencia } from "@/email/frequencias";
import { loadSubscribableScopes } from "@/lib/assinaturas-loader";

/** O que volta para a tela. `reativar` aparece quando o e-mail já é de um usuário desativado. */
export type Resultado =
  | { ok: true; senhaProvisoria?: string; nome?: string }
  | { ok: false; erro: string; reativar?: { id: string; nome: string } };

const falha = (erro: string): Resultado => ({ ok: false, erro });

const DadosUsuario = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(120, "O nome é longo demais."),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(200),
  perfil: z.enum(["usuario", "admin"]),
  agente: z.string().trim().max(100).nullable().optional(),
  resumos: z
    .array(z.object({ scopeType: z.string().trim().min(1).max(40), scopeId: z.string().trim().min(1).max(200) }))
    .max(100)
    .default([]),
  frequencias: z.array(z.enum(["dia", "semana", "mes"])).max(3).default([]),
});

const Id = z.string().uuid();

const primeiroErro = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos.";

function fim(resultado: Resultado): Resultado {
  revalidatePath("/usuarios");
  return resultado;
}

/** Confere o e-mail e o atendente contra os outros usuários. `ignorar` é o próprio usuário, na edição. */
async function conflitos(email: string, agente: string | null, ignorar?: string): Promise<Resultado | null> {
  const outro = await prisma.user.findUnique({ where: { email } });
  if (outro && outro.id !== ignorar) {
    return outro.deactivatedAt
      ? { ok: false, erro: `Este e-mail é de ${outro.name}, que está desativado.`, reativar: { id: outro.id, nome: outro.name } }
      : falha("Já existe um usuário com este e-mail.");
  }
  if (agente) {
    const vinculado = await prisma.user.findUnique({ where: { agentExternalId: agente } });
    if (vinculado && vinculado.id !== ignorar) return falha(`Este atendente já está vinculado a ${vinculado.name}.`);
    const existe = await prisma.agent.findFirst({ where: { tenantId: env.DEFAULT_TENANT_ID, externalId: agente }, select: { id: true } });
    if (!existe) return falha("Esse atendente não foi encontrado.");
  }
  return null;
}

/**
 * Confere os resumos marcados contra a lista de escopos do painel (item desconhecido é recusado) e tira os repetidos.
 * Quem já acompanha um escopo que deixou de existir pode continuar com ele: senão o administrador não conseguiria salvar.
 */
async function resumosValidos(
  pedidos: Array<{ scopeType: string; scopeId: string }>,
  jaTem: Array<{ scopeType: string; scopeId: string }> = [],
): Promise<{ ok: true; itens: Array<{ scopeType: string; scopeId: string }> } | { ok: false; erro: string }> {
  const { escopos } = await loadSubscribableScopes();
  const aceitos = new Set([...escopos, ...jaTem].map(chaveEscopo));
  const vistos = new Set<string>();
  const itens: Array<{ scopeType: string; scopeId: string }> = [];
  for (const p of pedidos) {
    const chave = chaveEscopo(p);
    if (!aceitos.has(chave)) return { ok: false, erro: "Um dos resumos escolhidos não existe mais. Atualize a página e escolha de novo." };
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    itens.push({ scopeType: p.scopeType, scopeId: p.scopeId });
  }
  return { ok: true, itens };
}

/** As três colunas de frequência, a partir das caixas marcadas. */
function colunasFrequencia(marcadas: Frequencia[]) {
  const set = new Set(marcadas);
  return Object.fromEntries(FREQUENCIAS.map((f) => [f.campo, set.has(f.granularity)])) as { resumoDia: boolean; resumoSemana: boolean; resumoMes: boolean };
}

/** Escopo marcado sem nenhuma frequência não manda nada: o administrador precisa escolher uma ou desmarcar os escopos. */
const SEM_FREQUENCIA = "Marque com que frequência a pessoa recebe, ou desmarque os escopos.";

/** Duas pessoas escolhendo o mesmo atendente ao mesmo tempo: o `@unique` do banco barra a segunda. */
async function trataUnico(e: unknown, agente: string | null): Promise<Resultado> {
  if ((e as { code?: string })?.code === "P2002") {
    const vinculado = agente ? await prisma.user.findUnique({ where: { agentExternalId: agente } }) : null;
    return falha(vinculado ? `Este atendente já está vinculado a ${vinculado.name}.` : "Já existe um usuário com este e-mail.");
  }
  throw e;
}

export async function criarUsuario(entrada: unknown): Promise<Resultado> {
  await requireAdmin();
  const dados = DadosUsuario.safeParse(entrada);
  if (!dados.success) return falha(primeiroErro(dados.error));
  const { nome, email, perfil } = dados.data;
  const agente = dados.data.agente || null;

  const conflito = await conflitos(email, agente);
  if (conflito) return conflito;
  const resumos = await resumosValidos(dados.data.resumos);
  if (!resumos.ok) return falha(resumos.erro);
  if (resumos.itens.length > 0 && dados.data.frequencias.length === 0) return falha(SEM_FREQUENCIA);

  const senha = generateTemporaryPassword();
  try {
    await prisma.user.create({
      data: {
        name: nome,
        email,
        role: perfil,
        agentExternalId: agente,
        passwordHash: await hashPassword(senha),
        mustChangePassword: true,
        ...colunasFrequencia(dados.data.frequencias),
        subscriptions: { create: resumos.itens },
      },
    });
  } catch (e) {
    return trataUnico(e, agente);
  }
  return fim({ ok: true, senhaProvisoria: senha, nome });
}

export async function editarUsuario(id: unknown, entrada: unknown): Promise<Resultado> {
  await requireAdmin();
  const idOk = Id.safeParse(id);
  const dados = DadosUsuario.safeParse(entrada);
  if (!idOk.success) return falha("Usuário não encontrado.");
  if (!dados.success) return falha(primeiroErro(dados.error));
  const { nome, email, perfil } = dados.data;
  const agente = dados.data.agente || null;

  const todos = await prisma.user.findMany({ select: { id: true, role: true, deactivatedAt: true } });
  const alvo = todos.find((u) => u.id === idOk.data);
  if (!alvo) return falha("Usuário não encontrado.");
  const motivo = motivoNaoMudarPerfil(alvo, perfil as Perfil, todos);
  if (motivo) return falha(motivo);

  const conflito = await conflitos(email, agente, alvo.id);
  if (conflito) return conflito;
  const atuais = await prisma.userReportSubscription.findMany({ where: { userId: alvo.id }, select: { scopeType: true, scopeId: true } });
  const resumos = await resumosValidos(dados.data.resumos, atuais);
  if (!resumos.ok) return falha(resumos.erro);
  if (resumos.itens.length > 0 && dados.data.frequencias.length === 0) return falha(SEM_FREQUENCIA);

  try {
    // As assinaturas são trocadas na mesma transação do cadastro.
    await prisma.$transaction([
      prisma.user.update({ where: { id: alvo.id }, data: { name: nome, email, role: perfil, agentExternalId: agente, ...colunasFrequencia(dados.data.frequencias) } }),
      prisma.userReportSubscription.deleteMany({ where: { userId: alvo.id } }),
      prisma.userReportSubscription.createMany({ data: resumos.itens.map((r) => ({ ...r, userId: alvo.id })) }),
    ]);
  } catch (e) {
    return trataUnico(e, agente);
  }
  return fim({ ok: true, nome });
}

export async function gerarSenhaProvisoria(id: unknown): Promise<Resultado> {
  const admin = await requireAdmin();
  const idOk = Id.safeParse(id);
  if (!idOk.success) return falha("Usuário não encontrado.");
  if (idOk.data === admin.id) return falha("Para trocar a sua senha, use «Trocar senha» no menu da sua conta.");

  const alvo = await prisma.user.findUnique({ where: { id: idOk.data } });
  if (!alvo || alvo.deactivatedAt) return falha("Usuário não encontrado.");

  const senha = generateTemporaryPassword();
  await prisma.user.update({
    where: { id: alvo.id },
    data: { passwordHash: await hashPassword(senha), mustChangePassword: true, failedLogins: 0, lockedUntil: null },
  });
  await endAllSessions(alvo.id);
  return fim({ ok: true, senhaProvisoria: senha, nome: alvo.name });
}

export async function desativarUsuario(id: unknown): Promise<Resultado> {
  const admin = await requireAdmin();
  const idOk = Id.safeParse(id);
  if (!idOk.success) return falha("Usuário não encontrado.");

  const todos = await prisma.user.findMany({ select: { id: true, role: true, deactivatedAt: true } });
  const alvo = todos.find((u) => u.id === idOk.data);
  if (!alvo) return falha("Usuário não encontrado.");
  const motivo = motivoNaoDesativar(alvo, todos, admin.id);
  if (motivo) return falha(motivo);

  await prisma.user.update({ where: { id: alvo.id }, data: { deactivatedAt: new Date() } });
  await endAllSessions(alvo.id);
  return fim({ ok: true });
}

/** Reativar mantém a senha que a pessoa tinha. */
export async function reativarUsuario(id: unknown): Promise<Resultado> {
  await requireAdmin();
  const idOk = Id.safeParse(id);
  if (!idOk.success) return falha("Usuário não encontrado.");

  const alvo = await prisma.user.findUnique({ where: { id: idOk.data } });
  if (!alvo) return falha("Usuário não encontrado.");
  await prisma.user.update({ where: { id: alvo.id }, data: { deactivatedAt: null, failedLogins: 0, lockedUntil: null } });
  return fim({ ok: true, nome: alvo.name });
}
