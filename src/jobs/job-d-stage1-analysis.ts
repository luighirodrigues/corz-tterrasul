import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { anonymizeText, truncateEvidence } from "../utils/anonymizer.js";

export const STAGE1_PROMPT_VERSION = "stage1-v1";

// Schema Zod para validação da resposta estruturada
export const CriterionScoreSchema = z.object({
  nota: z.number().min(0).max(10).nullable(),
  aplica: z.boolean(),
  evidencia: z.string().max(300).optional(),
});

export const Stage1OutputSchema = z.object({
  atrito: CriterionScoreSchema,
  solucao: CriterionScoreSchema,
  necessidade: CriterionScoreSchema,
  proximo_passo: CriterionScoreSchema,
  resolvida: CriterionScoreSchema,
  resumo: z.string().max(250),
  entidades: z.record(z.any()).optional(),
});

export type Stage1Output = z.infer<typeof Stage1OutputSchema>;

// JSON Schema formal para OpenAI Structured Outputs
const stage1JsonSchema = {
  name: "stage1_conversation_quality",
  strict: true,
  schema: {
    type: "object",
    properties: {
      atrito: {
        type: "object",
        properties: {
          nota: { type: ["number", "null"] },
          aplica: { type: "boolean" },
          evidencia: { type: "string" },
        },
        required: ["nota", "aplica", "evidencia"],
        additionalProperties: false,
      },
      solucao: {
        type: "object",
        properties: {
          nota: { type: ["number", "null"] },
          aplica: { type: "boolean" },
          evidencia: { type: "string" },
        },
        required: ["nota", "aplica", "evidencia"],
        additionalProperties: false,
      },
      necessidade: {
        type: "object",
        properties: {
          nota: { type: ["number", "null"] },
          aplica: { type: "boolean" },
          evidencia: { type: "string" },
        },
        required: ["nota", "aplica", "evidencia"],
        additionalProperties: false,
      },
      proximo_passo: {
        type: "object",
        properties: {
          nota: { type: ["number", "null"] },
          aplica: { type: "boolean" },
          evidencia: { type: "string" },
        },
        required: ["nota", "aplica", "evidencia"],
        additionalProperties: false,
      },
      resolvida: {
        type: "object",
        properties: {
          nota: { type: ["number", "null"] },
          aplica: { type: "boolean" },
          evidencia: { type: "string" },
        },
        required: ["nota", "aplica", "evidencia"],
        additionalProperties: false,
      },
      resumo: {
        type: "string",
      },
      entidades: {
        type: "object",
        properties: {
          interesse: { type: ["string", "null"] },
          modelo_veiculo: { type: ["string", "null"] },
          tipo_servico_peca: { type: ["string", "null"] },
        },
        required: ["interesse", "modelo_veiculo", "tipo_servico_peca"],
        additionalProperties: false,
      },
    },
    required: ["atrito", "solucao", "necessidade", "proximo_passo", "resolvida", "resumo", "entidades"],
    additionalProperties: false,
  },
};

export function calculateNotaConversa(result: Stage1Output): number | null {
  const criteria = [
    result.atrito,
    result.solucao,
    result.necessidade,
    result.proximo_passo,
    result.resolvida,
  ];

  const validScores: number[] = [];
  for (const c of criteria) {
    if (c.aplica && c.nota !== null && !isNaN(c.nota)) {
      validScores.push(c.nota);
    }
  }

  if (validScores.length === 0) return null;
  const avg = validScores.reduce((a, b) => a + b, 0) / validScores.length;
  return Number(avg.toFixed(2));
}

export interface Stage1Options {
  tenantId?: string;
  limit?: number;
  promptVersion?: string;
  forceReanalyze?: boolean;
}

export async function runJobDStage1Analysis(options: Stage1Options = {}): Promise<void> {
  const tenantId = options.tenantId || env.DEFAULT_TENANT_ID;
  const promptVersion = options.promptVersion || STAGE1_PROMPT_VERSION;
  const model = env.OPENAI_MODEL_STAGE1 || "gpt-4.1-mini";

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada no .env.");
  }

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  console.log(`[Job D] Buscando sessões COMPLETED pendentes de análise para o tenant: ${tenantId}...`);

  // Buscar sessões COMPLETED
  const sessions = await prisma.session.findMany({
    where: {
      tenantId,
      status: "COMPLETED",
      ...(options.forceReanalyze
        ? {}
        : {
            analyses: {
              none: {
                promptVersion,
                status: "done",
              },
            },
          }),
    },
    include: {
      messages: {
        orderBy: { timestamp: "asc" },
      },
      panelCards: true,
    },
    take: options.limit,
  });

  console.log(`[Job D] ${sessions.length} sessões encontradas para análise.`);

  for (const session of sessions) {
    console.log(`[Job D] Analisando sessão ${session.externalId} (${session.agentName || "sem atendente"})...`);

    // Filtrar mensagens válidas (ignorar TRACK e TRANSITION)
    const validMsgs = session.messages.filter(
      (m) => m.type !== "TRACK" && m.type !== "TRANSITION" && (m.text || m.transcription)
    );

    // Verificar se há mensagens humanas da operação
    const hasHumanOp = validMsgs.some((m) => m.direction === "FROM_HUB" && m.origin !== "BOT");
    if (!hasHumanOp) {
      console.log(`[Job D] Sessão ${session.externalId} pulada: sem mensagens humanas da operação.`);
      await prisma.sessionAnalysis.upsert({
        where: {
          tenantId_sessionExternalId_promptVersion: {
            tenantId,
            sessionExternalId: session.externalId,
            promptVersion,
          },
        },
        update: {
          status: "skipped",
          skippedReason: "sem mensagens humanas da operação",
          sessionId: session.id,
          model,
        },
        create: {
          tenantId,
          sessionExternalId: session.externalId,
          sessionId: session.id,
          promptVersion,
          model,
          status: "skipped",
          skippedReason: "sem mensagens humanas da operação",
        },
      });
      continue;
    }

    // Montar transcript compacto e anonimizado
    const transcriptLines = validMsgs.map((m, idx) => {
      const dirLabel = m.direction === "TO_HUB" ? "cliente" : "operacao";
      const originLabel = m.origin === "BOT" ? " [BOT]" : "";
      const rawContent = m.text || m.transcription || "";
      const safeContent = anonymizeText(rawContent, {
        clientName: session.contactName,
        clientPhone: session.contactPhone,
      });
      const timeStr = new Date(m.timestamp).toISOString().substring(11, 19);
      return `${idx + 1}. [${timeStr}] ${dirLabel}${originLabel}: ${safeContent}`;
    });

    const transcriptPayload = transcriptLines.join("\n");

    const systemPrompt = `Você avalia a qualidade de um atendimento via WhatsApp já encerrado.
Dê uma nota de 0 a 10 em cinco critérios objetivos. 10 é excelente.
- atrito: Houve dificuldade de entendimento ou atrito? ATENÇÃO À POLARIDADE: 10 significa pouco ou nenhum atrito (conversa fluida e agradável). 0 significa extremo atrito.
- solucao: O atendente ofereceu solução clara para o pedido do cliente?
- necessidade: O atendente compreendeu o que o cliente realmente queria?
- proximo_passo: Ficou explícito e combinado o que fazer depois (agendamento, retorno, envio de cotação)?
- resolvida: Houve conclusão no diálogo (agendamento firmado, test drive marcado, retorno combinado, pedido de peça definido)? Não confunda com venda fechada no CRM.

Regras Estritas:
1. Mensagens com origin [BOT] representam automação/robô, NÃO o atendente humano. Não avalie o atendente por falas do robô.
2. Não invente falas.
3. Se um critério não se aplicar à natureza do diálogo, marque aplica=false e nota=null.
4. evidencia: trecho curto de até 200 caracteres justificando a nota, rigorosamente sem nomes de clientes, telefones ou emails.`;

    const userPrompt = `Metadados:
- Sessão ID: ${session.externalId}
- Atendente: ${session.agentName || "Não identificado"}
- Departamento: ${session.departmentName || "Geral"}
- Painel CRM: ${session.panelCards[0]?.stepTitle || "Sem card"}
- Início: ${session.startAt?.toISOString() || "N/D"} | Fim: ${session.endAt?.toISOString() || "N/D"}

Transcrição do Atendimento:
${transcriptPayload}`;

    try {
      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: stage1JsonSchema as any,
        },
      });

      const rawJson = completion.choices[0]?.message?.content;
      if (!rawJson) {
        throw new Error("OpenAI retornou resposta vazia.");
      }

      const parsedData = Stage1OutputSchema.parse(JSON.parse(rawJson));

      // Higienizar evidências
      const safeEvidencias = {
        atrito: truncateEvidence(parsedData.atrito.evidencia || ""),
        solucao: truncateEvidence(parsedData.solucao.evidencia || ""),
        necessidade: truncateEvidence(parsedData.necessidade.evidencia || ""),
        proximo_passo: truncateEvidence(parsedData.proximo_passo.evidencia || ""),
        resolvida: truncateEvidence(parsedData.resolvida.evidencia || ""),
      };

      const notaConversa = calculateNotaConversa(parsedData);

      await prisma.sessionAnalysis.upsert({
        where: {
          tenantId_sessionExternalId_promptVersion: {
            tenantId,
            sessionExternalId: session.externalId,
            promptVersion,
          },
        },
        update: {
          status: "done",
          model,
          scoreAtrito: parsedData.atrito.aplica ? parsedData.atrito.nota : null,
          scoreSolucao: parsedData.solucao.aplica ? parsedData.solucao.nota : null,
          scoreNecessidade: parsedData.necessidade.aplica ? parsedData.necessidade.nota : null,
          scoreProximoPasso: parsedData.proximo_passo.aplica ? parsedData.proximo_passo.nota : null,
          scoreResolvida: parsedData.resolvida.aplica ? parsedData.resolvida.nota : null,
          notaConversa,
          evidencias: safeEvidencias,
          resumo1Linha: parsedData.resumo,
          entidades: (parsedData.entidades as any) ?? undefined,
          analyzedAt: new Date(),
          errorText: null,
        },
        create: {
          tenantId,
          sessionExternalId: session.externalId,
          sessionId: session.id,
          promptVersion,
          model,
          status: "done",
          scoreAtrito: parsedData.atrito.aplica ? parsedData.atrito.nota : null,
          scoreSolucao: parsedData.solucao.aplica ? parsedData.solucao.nota : null,
          scoreNecessidade: parsedData.necessidade.aplica ? parsedData.necessidade.nota : null,
          scoreProximoPasso: parsedData.proximo_passo.aplica ? parsedData.proximo_passo.nota : null,
          scoreResolvida: parsedData.resolvida.aplica ? parsedData.resolvida.nota : null,
          notaConversa,
          evidencias: safeEvidencias,
          resumo1Linha: parsedData.resumo,
          entidades: (parsedData.entidades as any) ?? undefined,
          analyzedAt: new Date(),
        },
      });

      console.log(`[Job D] Sessão ${session.externalId} analisada com sucesso: Nota ${notaConversa ?? "N/A"}`);
    } catch (err: any) {
      console.error(`[Job D] Erro ao analisar sessão ${session.externalId}:`, err.message);
      await prisma.sessionAnalysis.upsert({
        where: {
          tenantId_sessionExternalId_promptVersion: {
            tenantId,
            sessionExternalId: session.externalId,
            promptVersion,
          },
        },
        update: {
          status: "error",
          errorText: err.message,
          model,
        },
        create: {
          tenantId,
          sessionExternalId: session.externalId,
          sessionId: session.id,
          promptVersion,
          model,
          status: "error",
          errorText: err.message,
        },
      });
    }
  }

  console.log("[Job D] Execução do Estágio 1 finalizada.");
}
