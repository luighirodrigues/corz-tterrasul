import { requireAdmin } from "@/auth/dal";
import { motivoNaoDesativar, type Perfil } from "@/auth/rules";
import { UsuariosView, type AtendenteOpcao, type ResumoLinha, type UsuarioLinha } from "@/components/usuarios/UsuariosView";
import { env } from "@/config/env";
import { prisma } from "@/db/prisma";
import { agruparEscopos, chaveEscopo, rotuloEscopo } from "@/domain/report-scopes";
import { loadSubscribableScopes } from "@/lib/assinaturas-loader";

export const metadata = { title: "Usuários · Tterrasul" };

export default async function UsuariosPage() {
  const admin = await requireAdmin();
  const agora = new Date();

  const [usuarios, agentes, { escopos, tenant }] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" }, include: { subscriptions: true } }),
    prisma.agent.findMany({ where: { tenantId: env.DEFAULT_TENANT_ID }, orderBy: { name: "asc" }, select: { externalId: true, name: true, active: true } }),
    loadSubscribableScopes(),
  ]);

  const nomeDoAgente = new Map(agentes.map((a) => [a.externalId, a.name]));
  const donoDoAgente = new Map(usuarios.filter((u) => u.agentExternalId).map((u) => [u.agentExternalId as string, u.id]));

  const existentes = new Set(escopos.map(chaveEscopo));
  const resumosDe = (u: (typeof usuarios)[number]): ResumoLinha[] =>
    u.subscriptions
      .map((r) => ({ scopeType: r.scopeType, scopeId: r.scopeId, rotulo: rotuloEscopo(r.scopeType, r.scopeId, tenant), existe: existentes.has(chaveEscopo(r)) }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));

  const linha = (u: (typeof usuarios)[number]): UsuarioLinha => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role === "admin" ? "admin" : ("usuario" as Perfil),
    agentExternalId: u.agentExternalId,
    agentNome: u.agentExternalId ? (nomeDoAgente.get(u.agentExternalId) ?? null) : null,
    lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
    bloqueado: !!u.lockedUntil && u.lockedUntil > agora,
    desativadoEm: u.deactivatedAt?.toISOString() ?? null,
    resumos: resumosDe(u),
    frequencias: { resumoDia: u.resumoDia, resumoSemana: u.resumoSemana, resumoMes: u.resumoMes },
    voce: u.id === admin.id,
    motivoNaoDesativar: motivoNaoDesativar(u, usuarios, admin.id),
  });

  const atendentes: AtendenteOpcao[] = agentes
    .filter((a) => a.active || donoDoAgente.has(a.externalId))
    .map((a) => ({ externalId: a.externalId, nome: a.name, vinculadoA: donoDoAgente.get(a.externalId) ?? null }));

  return (
    <UsuariosView
      ativos={usuarios.filter((u) => !u.deactivatedAt).map(linha)}
      desativados={usuarios.filter((u) => u.deactivatedAt).map(linha)}
      atendentes={atendentes}
      grupos={agruparEscopos(escopos)}
    />
  );
}
