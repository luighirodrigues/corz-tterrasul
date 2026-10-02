-- Reversão manual da migração 3_periodos (o Prisma não executa este arquivo).
-- Antes: voltar o código para o commit anterior. Plano: docs/PLANO_PERIODOS.md (M8.5).
-- O código antigo lê relatórios mensais como se fossem semanas: apague-os antes.
DELETE FROM period_reports WHERE granularity = 'mes';
DROP INDEX IF EXISTS "period_reports_tenant_id_granularity_period_start_idx";
DROP INDEX IF EXISTS "sessions_tenant_id_start_at_idx";
DROP INDEX IF EXISTS "sessions_tenant_id_metrics_stale_idx";
ALTER TABLE "period_reports" DROP COLUMN IF EXISTS "granularity";
ALTER TABLE "sessions"
  DROP COLUMN IF EXISTS "tmr_seconds",
  DROP COLUMN IF EXISTS "tmr_fallback",
  DROP COLUMN IF EXISTS "sem_resposta",
  DROP COLUMN IF EXISTS "reativada",
  DROP COLUMN IF EXISTS "ftr_seconds",
  DROP COLUMN IF EXISTS "metrics_stale";
DELETE FROM "_prisma_migrations" WHERE migration_name = '3_periodos';
