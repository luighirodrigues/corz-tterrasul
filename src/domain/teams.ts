/**
 * Equipes dos relatórios = grupos de equipes da FLW (`GET /v2/department`).
 *
 * Na FLW a maioria das equipes é a fila de uma pessoa ("Keity Consultora", "Sérgio Vendas"), então o
 * relatório por equipe da FLW repetiria o do atendente. O `.env` junta as equipes da FLW em grupos:
 *
 *   TEAM_GROUPS="Vendas: Vendas; Sérgio Vendas | Peças: Peças; Jorge Peças"
 *
 * A conversa conta na equipe em que terminou (`departmentId` da sessão).
 * Sem imports: usado pelos jobs e pelas telas.
 */

export interface TeamGroup {
  name: string; // como escrito no .env: vira o scopeId e o título do relatório
  teams: string[]; // nomes das equipes da FLW, normalizados
}

export interface FlwTeamRef {
  id: string;
  name: string;
}

export interface TeamAssignment {
  /** id da equipe na FLW → nome do grupo. */
  groupOf: Map<string, string>;
  /** ids das equipes da FLW de cada grupo, na ordem do .env. */
  idsByGroup: Map<string, string[]>;
  /** Equipes da FLW fora de qualquer grupo e fora de IGNORED_TEAMS. */
  unmapped: FlwTeamRef[];
  /** Nomes do .env que não existem na FLW (digitação errada ou equipe apagada). */
  missing: string[];
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

/** Tira aspas simples/duplas em volta do valor: dependendo de como o EasyPanel repassa a variável, elas chegam literais. */
const unquote = (raw: string | null | undefined) => (raw ?? "").trim().replace(/^(["'])([\s\S]*)\1$/, "$2");

/** Lê TEAM_GROUPS. Lança com mensagem clara se a configuração estiver malformada. */
export function parseTeamGroups(raw: string | null | undefined): TeamGroup[] {
  const groups: TeamGroup[] = [];
  const seenGroup = new Set<string>();
  const teamOwner = new Map<string, string>();

  for (const part of unquote(raw).split("|")) {
    if (!part.trim()) continue;
    const colon = part.indexOf(":");
    if (colon < 0) throw new Error(`TEAM_GROUPS: grupo sem ":" em "${part.trim()}". Formato: "Grupo: Equipe; Equipe | Outro: Equipe".`);
    const name = part.slice(0, colon).trim();
    if (!name) throw new Error(`TEAM_GROUPS: grupo sem nome em "${part.trim()}".`);
    if (seenGroup.has(norm(name))) throw new Error(`TEAM_GROUPS: grupo "${name}" aparece duas vezes.`);
    seenGroup.add(norm(name));

    const teams = part
      .slice(colon + 1)
      .split(";")
      .map(norm)
      .filter(Boolean);
    if (teams.length === 0) throw new Error(`TEAM_GROUPS: grupo "${name}" sem nenhuma equipe.`);
    for (const t of teams) {
      const owner = teamOwner.get(t);
      if (owner) throw new Error(`TEAM_GROUPS: a equipe "${t}" está em "${owner}" e em "${name}".`);
      teamOwner.set(t, name);
    }
    groups.push({ name, teams });
  }
  return groups;
}

/** Lê IGNORED_TEAMS (filas de entrada, robô...): nomes separados por `;`. */
export const parseIgnoredTeams = (raw: string | null | undefined): string[] =>
  unquote(raw).split(";").map(norm).filter(Boolean);

/** Casa as equipes da FLW com os grupos pelo nome EXATO (sem acento e caixa), nunca por trecho. */
export function assignTeamGroups(teams: FlwTeamRef[], groups: TeamGroup[], ignored: string[]): TeamAssignment {
  const groupOf = new Map<string, string>();
  const idsByGroup = new Map<string, string[]>(groups.map((g) => [g.name, []]));
  const unmapped: FlwTeamRef[] = [];
  const found = new Set<string>();

  for (const team of teams) {
    const n = norm(team.name);
    const group = groups.find((g) => g.teams.includes(n));
    if (group) {
      groupOf.set(team.id, group.name);
      idsByGroup.get(group.name)!.push(team.id);
      found.add(n);
    } else if (!ignored.includes(n)) {
      unmapped.push(team);
    }
  }

  const missing = groups.flatMap((g) => g.teams.filter((t) => !found.has(t)));
  return { groupOf, idsByGroup, unmapped, missing };
}

/**
 * Conversas que não entram em nenhuma equipe do relatório: a equipe da FLW não está em nenhum grupo
 * nem em IGNORED_TEAMS (ou nem foi sincronizada ainda). Conversa sem equipe nenhuma não conta.
 */
export function countUnassigned(
  sessions: Array<{ departmentId: string | null; departmentName: string | null }>,
  assignment: TeamAssignment,
  knownIds: Set<string>,
): Array<{ name: string; count: number }> {
  const unmappedIds = new Set(assignment.unmapped.map((t) => t.id));
  const byName = new Map<string, number>();
  for (const s of sessions) {
    const id = s.departmentId;
    if (!id || assignment.groupOf.has(id)) continue;
    if (knownIds.has(id) && !unmappedIds.has(id)) continue; // ignorada de propósito
    const name = s.departmentName || id;
    byName.set(name, (byName.get(name) ?? 0) + 1);
  }
  return [...byName].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
