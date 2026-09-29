import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import type { PanelConfig } from "./panels.js";

export function panelConfigFromEnv(): PanelConfig {
  return {
    ids: {
      vendas: env.PANEL_VENDAS_ID || null,
      campanhas: env.PANEL_CAMPANHAS_ID || null,
      pecas: env.PANEL_PECAS_ID || null,
      oficina: env.PANEL_OFICINA_ID || null,
    },
    titles: {
      vendas: env.PANEL_VENDAS_TITLE,
      campanhas: env.PANEL_CAMPANHAS_TITLE,
      pecas: env.PANEL_PECAS_TITLE,
      oficina: env.PANEL_OFICINA_TITLE,
    },
  };
}

/**
 * Cria/atualiza o tenant a partir do .env. Chamada no início de TODOS os jobs,
 * para que mudanças no .env valham na corrida seguinte. IDs de painel só são
 * sobrescritos quando preenchidos no .env (não apaga o que já foi resolvido).
 */
export async function ensureTenant(tenantId: string = env.DEFAULT_TENANT_ID) {
  const goLive = env.GO_LIVE_AT ? new Date(env.GO_LIVE_AT) : null;
  const common = {
    name: env.DEFAULT_TENANT_NAME,
    timezone: env.TIMEZONE,
    periodWeekStart: env.PERIOD_WEEK_START,
    goLiveAt: goLive && !isNaN(goLive.getTime()) ? goLive : null,
    ignoredLostReasons: env.IGNORED_LOST_REASONS,
  };
  const panelIds = {
    ...(env.PANEL_VENDAS_ID ? { panelVendasId: env.PANEL_VENDAS_ID } : {}),
    ...(env.PANEL_CAMPANHAS_ID ? { panelCampanhasId: env.PANEL_CAMPANHAS_ID } : {}),
    ...(env.PANEL_PECAS_ID ? { panelPecasId: env.PANEL_PECAS_ID } : {}),
    ...(env.PANEL_OFICINA_ID ? { panelOficinaId: env.PANEL_OFICINA_ID } : {}),
  };
  return prisma.tenant.upsert({
    where: { id: tenantId },
    update: { ...common, ...panelIds, ...(env.FLW_TOKEN ? { token: env.FLW_TOKEN } : {}) },
    create: { id: tenantId, ...common, ...panelIds, token: env.FLW_TOKEN || null },
  });
}
