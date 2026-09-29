-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT,
    "panel_vendas_id" TEXT,
    "panel_campanhas_id" TEXT,
    "panel_pecas_id" TEXT,
    "panel_oficina_id" TEXT,
    "ignored_lost_reasons" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "number" TEXT,
    "title" TEXT,
    "contact_id" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "channel_id" TEXT,
    "channel_type" TEXT,
    "agent_external_id" TEXT,
    "agent_id" TEXT,
    "agent_name" TEXT,
    "department_id" TEXT,
    "department_name" TEXT,
    "status" TEXT NOT NULL,
    "start_at" TIMESTAMP(3),
    "first_response_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "last_interaction_date" TIMESTAMP(3),
    "time_wait" INTEGER,
    "time_service" INTEGER,
    "flw_created_at" TIMESTAMP(3),
    "flw_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "direction" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT,
    "text" TEXT,
    "file_url" TEXT,
    "transcription" TEXT,
    "sender_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panel_cards" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "panel_id" TEXT NOT NULL,
    "step_id" TEXT,
    "step_title" TEXT,
    "status" TEXT NOT NULL,
    "lost_reason" TEXT,
    "responsible_user_id" TEXT,
    "session_external_id" TEXT,
    "session_id" TEXT,
    "flw_created_at" TIMESTAMP(3),
    "flw_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "panel_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "cursor_date" TIMESTAMP(3),
    "current_page" INTEGER NOT NULL DEFAULT 1,
    "current_index" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "items_seen" INTEGER NOT NULL DEFAULT 0,
    "items_success" INTEGER NOT NULL DEFAULT 0,
    "items_failed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_analyses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "session_external_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "skipped_reason" TEXT,
    "score_atrito" INTEGER,
    "score_solucao" INTEGER,
    "score_necessidade" INTEGER,
    "score_proximo_passo" INTEGER,
    "score_resolvida" INTEGER,
    "nota_conversa" DOUBLE PRECISION,
    "evidencias" JSONB,
    "resumo_1linha" TEXT,
    "entidades" JSONB,
    "analyzed_at" TIMESTAMP(3),
    "error_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "period_reports" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "sinteticos" JSONB NOT NULL,
    "qualidade" JSONB NOT NULL,
    "funil" JSONB,
    "texto_fortes" JSONB,
    "texto_ops" JSONB,
    "preliminar" BOOLEAN NOT NULL DEFAULT false,
    "limitacoes" TEXT,
    "prompt_version_sintese" TEXT,
    "model" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "period_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agents_tenant_id_name_idx" ON "agents"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "agents_tenant_id_external_id_key" ON "agents"("tenant_id", "external_id");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_status_end_at_idx" ON "sessions"("tenant_id", "status", "end_at");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_agent_external_id_idx" ON "sessions"("tenant_id", "agent_external_id");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_contact_id_idx" ON "sessions"("tenant_id", "contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tenant_id_external_id_key" ON "sessions"("tenant_id", "external_id");

-- CreateIndex
CREATE INDEX "messages_session_id_timestamp_idx" ON "messages"("session_id", "timestamp");

-- CreateIndex
CREATE INDEX "messages_tenant_id_direction_origin_idx" ON "messages"("tenant_id", "direction", "origin");

-- CreateIndex
CREATE UNIQUE INDEX "messages_tenant_id_external_id_key" ON "messages"("tenant_id", "external_id");

-- CreateIndex
CREATE INDEX "panel_cards_tenant_id_panel_id_status_idx" ON "panel_cards"("tenant_id", "panel_id", "status");

-- CreateIndex
CREATE INDEX "panel_cards_tenant_id_session_external_id_idx" ON "panel_cards"("tenant_id", "session_external_id");

-- CreateIndex
CREATE UNIQUE INDEX "panel_cards_tenant_id_external_id_key" ON "panel_cards"("tenant_id", "external_id");

-- CreateIndex
CREATE INDEX "sync_jobs_tenant_id_job_type_status_idx" ON "sync_jobs"("tenant_id", "job_type", "status");

-- CreateIndex
CREATE INDEX "session_analyses_tenant_id_status_idx" ON "session_analyses"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "session_analyses_tenant_id_nota_conversa_idx" ON "session_analyses"("tenant_id", "nota_conversa");

-- CreateIndex
CREATE UNIQUE INDEX "session_analyses_tenant_id_session_external_id_prompt_versi_key" ON "session_analyses"("tenant_id", "session_external_id", "prompt_version");

-- CreateIndex
CREATE INDEX "period_reports_tenant_id_period_start_period_end_idx" ON "period_reports"("tenant_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "period_reports_tenant_id_period_start_period_end_scope_type_key" ON "period_reports"("tenant_id", "period_start", "period_end", "scope_type", "scope_id");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_cards" ADD CONSTRAINT "panel_cards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panel_cards" ADD CONSTRAINT "panel_cards_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_analyses" ADD CONSTRAINT "session_analyses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_analyses" ADD CONSTRAINT "session_analyses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "period_reports" ADD CONSTRAINT "period_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

