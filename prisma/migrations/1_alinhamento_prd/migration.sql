-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "go_live_at" TIMESTAMP(3),
ADD COLUMN     "hygiene_lost_reasons" TEXT,
ADD COLUMN     "period_week_start" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "contact_name_whatsapp" TEXT,
ADD COLUMN     "last_message_in" TIMESTAMP(3),
ADD COLUMN     "last_message_out" TIMESTAMP(3),
ADD COLUMN     "messages_pending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "messages_synced_at" TIMESTAMP(3),
ADD COLUMN     "messages_synced_flw_updated_at" TIMESTAMP(3),
ADD COLUMN     "session_type" TEXT;

-- AlterTable
ALTER TABLE "panel_cards" ADD COLUMN     "lost_reason_id" TEXT,
ADD COLUMN     "panel_title" TEXT,
ADD COLUMN     "step_phase" TEXT;

-- AlterTable
ALTER TABLE "sync_jobs" ADD COLUMN     "params" JSONB;

-- AlterTable
ALTER TABLE "session_analyses" ADD COLUMN     "atendentes_humanos" INTEGER,
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "audio_sem_transcricao" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cost_usd" DOUBLE PRECISION,
ADD COLUMN     "input_tokens" INTEGER,
ADD COLUMN     "messages_omitted" INTEGER,
ADD COLUMN     "next_retry_at" TIMESTAMP(3),
ADD COLUMN     "output_tokens" INTEGER,
ADD COLUMN     "transcript_truncated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "period_reports" ADD COLUMN     "comparativo" JSONB,
ADD COLUMN     "corrected_at" TIMESTAMP(3),
ADD COLUMN     "correction_reason" TEXT;

-- CreateTable
CREATE TABLE "period_report_revisions" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_report_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "period_report_revisions_report_id_idx" ON "period_report_revisions"("report_id");

-- AddForeignKey
ALTER TABLE "period_report_revisions" ADD CONSTRAINT "period_report_revisions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "period_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

