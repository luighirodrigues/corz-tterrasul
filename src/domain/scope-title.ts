export interface TitleTenant {
  panelVendasId?: string | null;
  panelCampanhasId?: string | null;
  panelPecasId?: string | null;
  panelOficinaId?: string | null;
}

export interface ScopeRef {
  scopeType: string;
  scopeId: string;
}

export interface ScopeTitle {
  title: string;
  key: string; // usado em nomes de arquivo
}

const DIVISIONS: Record<string, ScopeTitle> = {
  carros: { title: "Divisão Veículos (Vendas & Campanhas)", key: "veiculos" },
  pecas: { title: "Divisão Pós-Venda (Peças & Oficina)", key: "posvenda" },
};

export function resolveScopeTitle(
  rep: ScopeRef,
  tenant: TitleTenant | null,
  agentNames: Map<string, string> = new Map()
): ScopeTitle {
  switch (rep.scopeType) {
    case "geral":
      return { title: "Visão Geral da Operação", key: "geral_operacao" };
    case "divisao":
      return DIVISIONS[rep.scopeId] ?? { title: `Divisão ${rep.scopeId}`, key: rep.scopeId };
    case "equipe": {
      const safe = rep.scopeId.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_");
      return { title: `Equipe ${rep.scopeId}`, key: safe };
    }
    case "painel": {
      const panels: Array<[string | null | undefined, string, string]> = [
        [tenant?.panelVendasId, "Painel CRM - Vendas", "vendas"],
        [tenant?.panelCampanhasId, "Painel CRM - Campanhas", "campanhas"],
        [tenant?.panelPecasId, "Painel CRM - Peças", "pecas"],
        [tenant?.panelOficinaId, "Painel CRM - Oficina", "oficina"],
      ];
      const hit = panels.find(([id]) => id && id === rep.scopeId);
      return hit ? { title: hit[1], key: hit[2] } : { title: "Painel CRM", key: rep.scopeId };
    }
    case "agente": {
      const name = agentNames.get(rep.scopeId) ?? rep.scopeId;
      const safe = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_");
      return { title: `Atendente - ${name}`, key: safe };
    }
    default:
      return { title: `${rep.scopeType} - ${rep.scopeId}`, key: `${rep.scopeType}_${rep.scopeId}` };
  }
}
