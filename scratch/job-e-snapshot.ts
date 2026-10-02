// Uso: OPENAI_API_KEY= tsx scratch/job-e-snapshot.ts <saida.json> [inicio-ISO fim-ISO]
// Roda o Job E em rascunho (sem IA, sem gravar) e salva os rascunhos para comparar antes/depois de uma refatoração.
import { writeFileSync } from "node:fs";
import { prisma } from "../src/db/prisma.js";
import { runJobEStage2Reports } from "../src/jobs/job-e-stage2-report.js";

const [out, start = "2026-09-23T03:00:00.000Z", end = "2026-09-30T02:59:59.999Z", granularity] = process.argv.slice(2);
const t0 = Date.now();
const r = await runJobEStage2Reports({ startDate: new Date(start), endDate: new Date(end), dryRun: true, ...(granularity ? { granularity: granularity as any } : {}) });
console.log(`drafts=${r.drafts.length} tempo=${((Date.now() - t0) / 1000).toFixed(1)}s`);
writeFileSync(out, JSON.stringify(r.drafts, null, 1));
await prisma.$disconnect();
