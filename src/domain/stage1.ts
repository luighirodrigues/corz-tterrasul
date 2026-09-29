import { z } from "zod";

export const STAGE1_PROMPT_VERSION = "stage1-v2";

export const CRITERIA_KEYS = ["atrito", "solucao", "necessidade", "proximo_passo", "resolvida"] as const;
export type Stage1Key = (typeof CRITERIA_KEYS)[number];

// Zod: valida a FORMA. Faixa e coerência são normalizadas depois (não derrubam a análise inteira).
export const CriterionScoreSchema = z.object({
  nota: z.number().int().nullable(),
  aplica: z.boolean(),
  evidencia: z.string().optional(),
});

export const Stage1OutputSchema = z.object({
  atrito: CriterionScoreSchema,
  solucao: CriterionScoreSchema,
  necessidade: CriterionScoreSchema,
  proximo_passo: CriterionScoreSchema,
  resolvida: CriterionScoreSchema,
  resumo: z.string(),
  entidades: z.record(z.any()).optional(),
});

export type Stage1Output = z.infer<typeof Stage1OutputSchema>;

const criterion = {
  type: "object",
  properties: {
    nota: { type: ["integer", "null"] },
    aplica: { type: "boolean" },
    evidencia: { type: "string" },
  },
  required: ["nota", "aplica", "evidencia"],
  additionalProperties: false,
};

export const stage1JsonSchema = {
  name: "stage1_conversation_quality",
  strict: true,
  schema: {
    type: "object",
    properties: {
      atrito: criterion,
      solucao: criterion,
      necessidade: criterion,
      proximo_passo: criterion,
      resolvida: criterion,
      resumo: { type: "string" },
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
    required: [...CRITERIA_KEYS, "resumo", "entidades"],
    additionalProperties: false,
  },
};

export const STAGE1_SYSTEM_PROMPT = `Você avalia a qualidade de um atendimento de WhatsApp já encerrado entre uma loja (venda de carros, peças e oficina) e um cliente.

Dê nota inteira de 0 a 10 em cinco critérios. 10 é excelente.
- atrito: houve dificuldade de entendimento? POLARIDADE INVERTIDA: 10 = pouco ou nenhum atrito; 0 = atrito extremo.
- solucao: o atendente ofereceu solução clara para o pedido?
- necessidade: o atendente compreendeu o que o cliente queria?
- proximo_passo: ficou claro o que fazer depois, com combinado explícito?
- resolvida: houve conclusão no diálogo (agendamento, test drive, retorno combinado, peça combinada)? Não é venda no CRM.

Como ler a transcrição:
- Cada linha é um JSON com n, t (data e hora local), dir, origin, atendente e text.
- dir = "cliente": fala do cliente. dir = "operacao": mensagem enviada pela loja. dir = "nota_interna": anotação interna que o cliente NÃO viu; use só como contexto, nunca como fala ao cliente.
- Só é fala do atendente humano a mensagem com dir = "operacao" e origin = "DEFAULT" ou "GATEWAY" (atendente digitando direto no WhatsApp). Mensagens com origin BOT, OFFICE_HOURS, CAMPAIGN, API ou PAYMENT são automáticas: não dê crédito nem culpa ao atendente por elas.
- Marcadores entre colchetes ([áudio sem transcrição], [imagem], [... N mensagens omitidas do meio ...]) indicam conteúdo que você não vê. Não suponha o que havia nele. Se isso impedir avaliar um critério, marque aplica=false.

Regras:
1. Não invente falas nem fatos.
2. Se o critério não se aplicar: aplica=false e nota=null. Se aplica=true, a nota é obrigatória.
3. evidencia: até 200 caracteres, citação curta ou paráfrase, sem nome, telefone, e-mail ou documento do cliente (use {{cliente}}).
4. resumo: uma linha, até 200 caracteres, sem dados pessoais do cliente.`;

export interface NormalizedStage1 {
  output: Stage1Output;
  warnings: string[];
}

/**
 * Coerência antes de gravar: aplica=true sem nota vira não-aplicável; aplica=false ignora a nota;
 * nota fora de 0–10 é limitada (com aviso) em vez de derrubar a análise.
 */
export function normalizeStage1(raw: Stage1Output): NormalizedStage1 {
  const warnings: string[] = [];
  const out: Stage1Output = { ...raw };
  for (const k of CRITERIA_KEYS) {
    const c = { ...raw[k] };
    if (c.aplica && c.nota == null) {
      warnings.push(`${k}: aplica=true sem nota; tratado como não aplicável`);
      c.aplica = false;
    }
    if (!c.aplica && c.nota != null) {
      warnings.push(`${k}: nota ignorada porque aplica=false`);
      c.nota = null;
    }
    if (c.nota != null && (c.nota < 0 || c.nota > 10)) {
      warnings.push(`${k}: nota ${c.nota} fora de 0–10; limitada`);
      c.nota = Math.min(10, Math.max(0, c.nota));
    }
    out[k] = c;
  }
  return { output: out, warnings };
}

export function calculateNotaConversa(result: Stage1Output): number | null {
  const valid: number[] = [];
  for (const k of CRITERIA_KEYS) {
    const c = result[k];
    if (c.aplica && c.nota !== null && !isNaN(c.nota)) valid.push(c.nota);
  }
  if (valid.length === 0) return null;
  return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
}

export function cutText(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 3).trim() + "...";
}
