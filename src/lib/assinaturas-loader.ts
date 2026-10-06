import { prisma } from "@/db/prisma";
import { listSubscribableScopes, type EscopoAssinavel } from "@/domain/report-scopes";
import { parseTeamGroups, type TeamGroup } from "@/domain/teams";

const carregarTenant = () =>
  prisma.tenant.findFirst({
    select: { id: true, teamGroups: true, panelVendasId: true, panelCampanhasId: true, panelPecasId: true, panelOficinaId: true },
  });

export type TenantEscopos = Awaited<ReturnType<typeof carregarTenant>>;

/**
 * Escopos que o administrador pode marcar em /usuarios. Os grupos de equipes vêm do tenant (a cópia do
 * `TEAM_GROUPS` que o último job gravou). Configuração malformada deixa só as equipes de fora.
 */
export async function loadSubscribableScopes(): Promise<{ escopos: EscopoAssinavel[]; tenant: TenantEscopos }> {
  const tenant = await carregarTenant();
  let grupos: TeamGroup[] = [];
  try {
    grupos = parseTeamGroups(tenant?.teamGroups);
  } catch (err) {
    console.warn("[assinaturas] TEAM_GROUPS inválido:", err instanceof Error ? err.message : err);
  }
  return { escopos: listSubscribableScopes(tenant, grupos), tenant };
}
