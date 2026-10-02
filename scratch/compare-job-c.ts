// B1: o Job C novo (colunas gravadas) tem de dar EXATAMENTE os números do antigo (calcula das mensagens).
// Uso: tsx scratch/compare-job-c.ts
import { prisma } from "../src/db/prisma.js";
import { calculateSynthetics as novo } from "../src/jobs/job-c-synthetics.js";
import { calculateSynthetics as antigo } from "./job-c-old.js";
import { assignTeamGroups, parseIgnoredTeams, parseTeamGroups } from "../src/domain/teams.js";

const tenant = (await prisma.tenant.findFirst())!;
const tenantId = tenant.id;

// janelas: semanas de quarta a terça e o mês, a partir do 1º dia com dados
const D = (iso: string) => new Date(iso);
const weeks: Array<[Date, Date]> = [];
for (let s = D("2026-09-16T03:00:00.000Z"); s < D("2026-10-02T03:00:00.000Z"); s = new Date(s.getTime() + 7 * 864e5)) {
  weeks.push([s, new Date(s.getTime() + 7 * 864e5 - 1)]);
}
weeks.push([D("2026-09-01T03:00:00.000Z"), D("2026-10-01T02:59:59.999Z")]);
weeks.push([D("2026-09-05T03:00:00.000Z"), D("2026-09-11T02:59:59.999Z")]);

const panels = [tenant.panelVendasId, tenant.panelCampanhasId, tenant.panelPecasId, tenant.panelOficinaId].filter(Boolean) as string[];
const agents = (await prisma.session.findMany({ where: { tenantId, agentExternalId: { not: null } }, select: { agentExternalId: true }, distinct: ["agentExternalId"] })).map((a) => a.agentExternalId!);
const deps = await prisma.department.findMany({ where: { tenantId }, select: { externalId: true, name: true } });
const groups = parseTeamGroups(tenant.teamGroups);
const asg = assignTeamGroups(deps.map((d) => ({ id: d.externalId, name: d.name })), groups, parseIgnoredTeams(tenant.ignoredTeams));

const filters: Array<[string, object]> = [["geral", {}]];
for (const p of panels) filters.push([`painel ${p.slice(0, 4)}`, { panelIds: [p] }]);
if (panels.length >= 2) filters.push(["divisao carros", { panelIds: panels.slice(0, 2) }]);
for (const a of agents) filters.push([`agente ${a.slice(0, 4)}`, { agentExternalId: a }]);
for (const [g, ids] of asg.idsByGroup) filters.push([`equipe ${g}`, { departmentIds: ids }]);

let bad = 0, total = 0;
for (const [start, end] of weeks) {
  for (const [name, f] of filters) {
    const a = await antigo({ tenantId, startDate: start, endDate: end, ...f });
    const b = await novo({ tenantId, startDate: start, endDate: end, ...f });
    total++;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      bad++;
      console.log(`DIFERENTE ${start.toISOString()} ${name}\n antigo=${JSON.stringify(a)}\n novo  =${JSON.stringify(b)}`);
    }
  }
}
console.log(`${total} comparações, ${bad} diferentes.`);
await prisma.$disconnect();
process.exit(bad ? 1 : 0);
