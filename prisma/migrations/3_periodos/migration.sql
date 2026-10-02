-- AlterTable
ALTER TABLE "period_reports" ADD COLUMN     "granularity" TEXT NOT NULL DEFAULT 'semana';

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "ftr_seconds" DOUBLE PRECISION,
ADD COLUMN     "metrics_stale" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "reativada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sem_resposta" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tmr_fallback" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tmr_seconds" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "period_reports_tenant_id_granularity_period_start_idx" ON "period_reports"("tenant_id", "granularity", "period_start");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_start_at_idx" ON "sessions"("tenant_id", "start_at");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_metrics_stale_idx" ON "sessions"("tenant_id", "metrics_stale");
