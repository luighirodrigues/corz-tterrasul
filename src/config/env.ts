import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/corz_qualidade?schema=public"),
  FLW_TOKEN: z.string().default(""),
  FLW_CHAT_URL: z.string().default("https://api.wts.chat/chat"),
  FLW_CORE_URL: z.string().default("https://api.wts.chat/core"),
  FLW_CRM_URL: z.string().default("https://api.wts.chat/crm"),
  FLW_RATE_LIMIT_PER_MINUTE: z.coerce.number().default(60),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL_STAGE1: z.string().default("gpt-4.1-mini"),
  OPENAI_MODEL_STAGE2: z.string().default("gpt-4.1"),
  OPENAI_MAX_USD_PER_RUN: z.coerce.number().default(50.0),
  DEFAULT_TENANT_ID: z.string().default("tterrasul"),
  DEFAULT_TENANT_NAME: z.string().default("Tterrasul"),
  TIMEZONE: z.string().default("America/Sao_Paulo"),
  PANEL_VENDAS_ID: z.string().default(""),
  PANEL_CAMPANHAS_ID: z.string().default(""),
  PANEL_PECAS_ID: z.string().default(""),
  PANEL_OFICINA_ID: z.string().default(""),
  IGNORED_LOST_REASONS: z.string().default("falta de peca fornecedor,cancelamento de fabrica"),
});

export const env = envSchema.parse(process.env);
