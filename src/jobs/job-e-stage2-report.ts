import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { calculateSynthetics } from "./job-c-synthetics.js";
import { STAGE1_PROMPT_VERSION } from "./job-d-stage1-analysis.js";

export const STAGE2_PROMPT_VERSION = "stage2-v1";

const BulletItemSchema = z.object({
  n_casos: z.number(),
  texto: z.string(),
  script_sugerido: z.string().nullable().optional(),
});

export const Stage2OutputSchema = z.object({
  pontos_fortes: z.array(BulletItemSchema),
  oportunidades: z.array(BulletItemSchema),
});

export type Stage2Output = z.infer<typeof Stage2OutputSchema>;

const stage2JsonSchema = {
  name: "stage2_managerial_synthesis",
  strict: true,
  schema: {
    type: "object",
    properties: {
      pontos_fortes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            n_casos: { type: "number" },
            texto: { type: "string" },
            script_sugerido: { type: ["string", "null"] },
          },
          required: ["n_casos", "texto", "script_sugerido"],
          additionalProperties: false,
        },
      },
      oportunidades: {
        type: "array",
        items: {
          type: "object",
          properties: {
            n_casos: { type: "number" },
            texto: { type: "string" },
            script_sugerido: { type: ["string", "null"] },
          },
          required: ["n_casos", "texto", "script_sugerido"],
          additionalProperties: false,
        },
      },
    },
    required: ["pontos_fortes", "oportunidades"],
    additionalProperties: false,
  },
};

export interface ReportScope {
  scopeType: "geral" | "divisao" | "painel" | "agente";
  scopeId: string;
  name: string;
  panelIds?: string[];
  agentExternalId?: string;
}

export interface RunStage2Options {
  tenantId?: string;
  startDate: Date;
  endDate: Date;
  promptVersion?: string;
}

export async function runJobEStage2Reports(options: RunStage2Options): Promise<void> {
  const tenantId = options.tenantId || env.DEFAULT_TENANT_ID;
  const promptVersion = options.promptVersion || STAGE2_PROMPT_VERSION;
  const model = env.OPENAI_MODEL_STAGE2 || "gpt-4.1";

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error(`Tenant ${tenantId} não encontrado.`);
  }

  const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

  console.log(`[Job E] Iniciando relatórios do período: ${options.startDate.toISOString()} até ${options.endDate.toISOString()}`);

  // 1. Definir os escopos para relatório
  const scopes: ReportScope[] = [
    { scopeType: "geral", scopeId: "geral", name: "Visão Geral da Operação" },
  ];

  // Divisões
  const carPanels = [tenant.panelVendasId, tenant.panelCampanhasId].filter((id): id is string => !!id);
  if (carPanels.length > 0) {
    scopes.push({
      scopeType: "divisao",
      scopeId: "carros",
      name: "Venda de Veículos",
      panelIds: carPanels,
    });
  }

  const partsPanels = [tenant.panelPecasId, tenant.panelOficinaId].filter((id): id is string => !!id);
  if (partsPanels.length > 0) {
    scopes.push({
      scopeType: "divisao",
      scopeId: "pecas",
      name: "Peças e Oficina",
      panelIds: partsPanels,
    });
  }

  // Painéis individuais
  if (tenant.panelVendasId) {
    scopes.push({ scopeType: "painel", scopeId: tenant.panelVendasId, name: "Painel Vendas", panelIds: [tenant.panelVendasId] });
  }
  if (tenant.panelCampanhasId) {
    scopes.push({ scopeType: "painel", scopeId: tenant.panelCampanhasId, name: "Painel Campanhas", panelIds: [tenant.panelCampanhasId] });
  }
  if (tenant.panelPecasId) {
    scopes.push({ scopeType: "painel", scopeId: tenant.panelPecasId, name: "Painel Peças", panelIds: [tenant.panelPecasId] });
  }
  if (tenant.panelOficinaId) {
    scopes.push({ scopeType: "painel", scopeId: tenant.panelOficinaId, name: "Painel Oficina", panelIds: [tenant.panelOficinaId] });
  }

  // Agentes com atendimentos na janela
  const agentsWithSessions = await prisma.session.findMany({
    where: {
      tenantId,
      startAt: { gte: options.startDate, lte: options.endDate },
      agentExternalId: { not: null },
    },
    select: { agentExternalId: true, agentName: true },
    distinct: ["agentExternalId"],
  });

  for (const ag of agentsWithSessions) {
    if (ag.agentExternalId) {
      scopes.push({
        scopeType: "agente",
        scopeId: ag.agentExternalId,
        name: ag.agentName || `Atendente ${ag.agentExternalId}`,
        agentExternalId: ag.agentExternalId,
      });
    }
  }

  console.log(`[Job E] Serão gerados ${scopes.length} relatórios por escopo.`);

  for (const scope of scopes) {
    console.log(`[Job E] Processando escopo: [${scope.scopeType}] ${scope.name} (${scope.scopeId})...`);

    // A. Filtrar sessões analisadas para o escopo
    const sessionWhere: any = {
      tenantId,
      startAt: { gte: options.startDate, lte: options.endDate },
      analyses: {
        some: {
          status: "done",
          promptVersion: STAGE1_PROMPT_VERSION,
        },
      },
    };

    if (scope.agentExternalId) {
      sessionWhere.agentExternalId = scope.agentExternalId;
    }
    if (scope.panelIds && scope.panelIds.length > 0) {
      sessionWhere.panelCards = {
        some: {
          panelId: { in: scope.panelIds },
        },
      };
    }

    const sessions = await prisma.session.findMany({
      where: sessionWhere,
      include: {
        analyses: {
          where: { status: "done", promptVersion: STAGE1_PROMPT_VERSION },
        },
      },
    });

    const n = sessions.length;
    const preliminar = n < 10;

    // B. Médias dos 5 critérios e Nota Geral
    let sumAtrito = 0, countAtrito = 0;
    let sumSolucao = 0, countSolucao = 0;
    let sumNecessidade = 0, countNecessidade = 0;
    let sumProximoPasso = 0, countProximoPasso = 0;
    let sumResolvida = 0, countResolvida = 0;
    let sumNotaGeral = 0;

    // Histograma de 0 a 10 (11 posições)
    const histograma = new Array(11).fill(0);
    const sampleInsights: Array<{ resumo: string; evidencias: any }> = [];

    for (const s of sessions) {
      const a = s.analyses[0];
      if (!a) continue;

      if (a.scoreAtrito !== null) { sumAtrito += a.scoreAtrito; countAtrito++; }
      if (a.scoreSolucao !== null) { sumSolucao += a.scoreSolucao; countSolucao++; }
      if (a.scoreNecessidade !== null) { sumNecessidade += a.scoreNecessidade; countNecessidade++; }
      if (a.scoreProximoPasso !== null) { sumProximoPasso += a.scoreProximoPasso; countProximoPasso++; }
      if (a.scoreResolvida !== null) { sumResolvida += a.scoreResolvida; countResolvida++; }

      if (a.notaConversa !== null) {
        sumNotaGeral += a.notaConversa;
        const rounded = Math.min(10, Math.max(0, Math.round(a.notaConversa)));
        histograma[rounded]++;
      }

      if (sampleInsights.length < 10 && (a.resumo1Linha || a.evidencias)) {
        sampleInsights.push({
          resumo: a.resumo1Linha || "",
          evidencias: a.evidencias,
        });
      }
    }

    const qualidade = {
      n,
      notaGeral: n > 0 ? Number((sumNotaGeral / n).toFixed(1)) : 0,
      medias: {
        atrito: countAtrito > 0 ? Number((sumAtrito / countAtrito).toFixed(1)) : null,
        solucao: countSolucao > 0 ? Number((sumSolucao / countSolucao).toFixed(1)) : null,
        necessidade: countNecessidade > 0 ? Number((sumNecessidade / countNecessidade).toFixed(1)) : null,
        proximoPasso: countProximoPasso > 0 ? Number((sumProximoPasso / countProximoPasso).toFixed(1)) : null,
        resolvida: countResolvida > 0 ? Number((sumResolvida / countResolvida).toFixed(1)) : null,
      },
      histograma,
    };

    // C. Métricas sintéticas via Job C
    const sinteticos = await calculateSynthetics({
      tenantId,
      startDate: options.startDate,
      endDate: options.endDate,
      agentExternalId: scope.agentExternalId,
      panelId: scope.panelIds && scope.panelIds.length === 1 ? scope.panelIds[0] : undefined,
    });

    // D. Funil CRM
    let funil: any = null;
    if (scope.panelIds && scope.panelIds.length > 0) {
      const cards = await prisma.panelCard.findMany({
        where: {
          tenantId,
          panelId: { in: scope.panelIds },
          flwCreatedAt: { gte: options.startDate, lte: options.endDate },
        },
        select: { status: true, stepTitle: true, lostReason: true },
      });

      const etapas: Record<string, number> = {};
      const lostReasons: Record<string, number> = {};
      let won = 0, lost = 0, open = 0;

      for (const c of cards) {
        if (c.stepTitle) etapas[c.stepTitle] = (etapas[c.stepTitle] || 0) + 1;
        if (c.status.toUpperCase() === "WON") won++;
        else if (c.status.toUpperCase() === "LOST") {
          lost++;
          if (c.lostReason) lostReasons[c.lostReason] = (lostReasons[c.lostReason] || 0) + 1;
        } else open++;
      }

      funil = { etapas, open, won, lost, lostReasons };
    }

    // E. IA Estágio 2 (Síntese Gerencial)
    let textoFortes: any = [];
    let textoOps: any = [];

    if (openai && n > 0) {
      try {
        const stage2System = `Você escreve feedback gerencial com base em agregados já calculados de atendimento via WhatsApp.
Regras fundamentais:
1. NÃO recalcule notas. Use as médias fornecidas.
2. Cada bullet deve citar explicitamente quantidades comprovadas nos dados fornecidos (exemplo: "Em 6 das ${n} conversas analisadas...").
3. Em oportunidades, inclua sempre que relevante uma frase pronta de script recomendada para o atendente.
4. Jamais use nomes de clientes, CPFs ou telefones.
5. Não invente contagens não sustentadas pelos resumos e agregados.`;

        const stage2User = `Escopo: ${scope.name}
Total de Conversas Analisadas: ${n}
Nota Geral (0-10): ${qualidade.notaGeral}
Médias dos Critérios: ${JSON.stringify(qualidade.medias)}
Histograma de Notas: ${JSON.stringify(qualidade.histograma)}
KPIs Sintéticos: TMR=${sinteticos.tmrMedioFormatado}, Sem Resposta=${sinteticos.semRespostaPct}%, Fechamento=${sinteticos.taxaFechamentoPct ?? "N/A"}%
Amostra de Casos Analisados:
${JSON.stringify(sampleInsights, null, 2)}`;

        const comp = await openai.chat.completions.create({
          model,
          messages: [
            { role: "system", content: stage2System },
            { role: "user", content: stage2User },
          ],
          response_format: {
            type: "json_schema",
            json_schema: stage2JsonSchema as any,
          },
        });

        const rawJson = comp.choices[0]?.message?.content;
        if (rawJson) {
          const parsed = Stage2OutputSchema.parse(JSON.parse(rawJson));
          textoFortes = parsed.pontos_fortes;
          textoOps = parsed.oportunidades;
        }
      } catch (err: any) {
        console.warn(`[Job E] Aviso ao gerar síntese com IA para ${scope.name}: ${err.message}`);
      }
    }

    // F. Persistir snapshot imutável em period_reports
    await prisma.periodReport.upsert({
      where: {
        tenantId_periodStart_periodEnd_scopeType_scopeId: {
          tenantId,
          periodStart: options.startDate,
          periodEnd: options.endDate,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
        },
      },
      update: {
        sinteticos: sinteticos as any,
        qualidade: qualidade as any,
        funil: funil as any,
        textoFortes: textoFortes as any,
        textoOps: textoOps as any,
        preliminar,
        limitacoes: preliminar ? "Amostra preliminar com menos de 10 conversas analisadas." : null,
        promptVersionSintese: promptVersion,
        model,
        publishedAt: new Date(),
      },
      create: {
        tenantId,
        periodStart: options.startDate,
        periodEnd: options.endDate,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        sinteticos: sinteticos as any,
        qualidade: qualidade as any,
        funil: funil as any,
        textoFortes: textoFortes as any,
        textoOps: textoOps as any,
        preliminar,
        limitacoes: preliminar ? "Amostra preliminar com menos de 10 conversas analisadas." : null,
        promptVersionSintese: promptVersion,
        model,
      },
    });

    console.log(`[Job E] Relatório para ${scope.name} salvo com sucesso. (Nota Geral: ${qualidade.notaGeral}, n=${n})`);
  }

  console.log("[Job E] Todos os relatórios do período foram gerados e persistidos com sucesso!");
}
