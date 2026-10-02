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
  SYNC_OVERLAP_MINUTES: z.coerce.number().default(15),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL_STAGE1: z.string().default("gpt-4.1-mini"),
  OPENAI_MODEL_STAGE2: z.string().default("gpt-4.1"),
  OPENAI_MAX_USD_PER_RUN: z.coerce.number().default(50.0),
  OPENAI_TIMEOUT_STAGE1_MS: z.coerce.number().default(60000),
  OPENAI_TIMEOUT_STAGE2_MS: z.coerce.number().default(120000),
  // Preços em US$ por 1M de tokens (mudam; nada fixo no código). Sem preço, o teto de custo não se aplica.
  OPENAI_PRICE_STAGE1_INPUT_PER_1M: z.coerce.number().default(0),
  OPENAI_PRICE_STAGE1_OUTPUT_PER_1M: z.coerce.number().default(0),
  STAGE1_MAX_TRANSCRIPT_TOKENS: z.coerce.number().default(8000),
  STAGE1_MAX_ATTEMPTS: z.coerce.number().default(5),
  DEFAULT_TENANT_ID: z.string().default("tterrasul"),
  DEFAULT_TENANT_NAME: z.string().default("Tterrasul"),
  TIMEZONE: z.string().default("America/Sao_Paulo"),
  PERIOD_WEEK_START: z.coerce.number().int().min(1).max(7).default(3),
  GO_LIVE_AT: z.string().default(""),
  PANEL_VENDAS_ID: z.string().default(""),
  PANEL_CAMPANHAS_ID: z.string().default(""),
  PANEL_PECAS_ID: z.string().default(""),
  PANEL_OFICINA_ID: z.string().default(""),
  PANEL_VENDAS_TITLE: z.string().default("Vendas"),
  PANEL_CAMPANHAS_TITLE: z.string().default("Campanhas"),
  PANEL_PECAS_TITLE: z.string().default("Peças"),
  PANEL_OFICINA_TITLE: z.string().default("Oficina"),
  IGNORED_LOST_REASONS: z.string().default(""),
  HYGIENE_LOST_REASONS: z.string().default(""),
  TEAM_GROUPS: z.string().default(""),
  IGNORED_TEAMS: z.string().default(""),
  CRITERION_MIN_COVERAGE: z.coerce.number().min(0).max(1).default(0.3),
});

export const env = envSchema.parse(process.env);
