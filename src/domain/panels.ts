export type PanelKey = "vendas" | "campanhas" | "pecas" | "oficina";

export const PANEL_KEYS: PanelKey[] = ["vendas", "campanhas", "pecas", "oficina"];

export interface PanelConfig {
  ids: Partial<Record<PanelKey, string | null | undefined>>;
  titles: Record<PanelKey, string>;
}

export interface FlwPanelRef {
  id: string;
  title: string;
}

export const normalizeTitle = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

/**
 * Resolve o ID dos 4 painéis: ID configurado vence; senão, título EXATO (normalizado).
 * Falha (lança) se algum painel não for encontrado ou se o título for ambíguo.
 */
export function resolvePanelIds(panels: FlwPanelRef[], cfg: PanelConfig): Record<PanelKey, string> {
  const out = {} as Record<PanelKey, string>;
  const problems: string[] = [];

  for (const key of PANEL_KEYS) {
    const configured = cfg.ids[key];
    if (configured) {
      out[key] = configured;
      continue;
    }
    const wanted = normalizeTitle(cfg.titles[key]);
    const hits = panels.filter((p) => normalizeTitle(p.title) === wanted);
    if (hits.length === 1) out[key] = hits[0].id;
    else if (hits.length === 0) problems.push(`painel "${cfg.titles[key]}" (${key}) não encontrado`);
    else problems.push(`painel "${cfg.titles[key]}" (${key}) ambíguo: ${hits.length} painéis com o mesmo título`);
  }

  if (problems.length) {
    const available = panels.map((p) => `${p.title} (${p.id})`).join("; ") || "nenhum";
    throw new Error(
      `Não foi possível resolver os painéis: ${problems.join("; ")}. Painéis na FLW: ${available}. ` +
        `Configure PANEL_*_ID ou PANEL_*_TITLE no .env.`
    );
  }
  return out;
}
