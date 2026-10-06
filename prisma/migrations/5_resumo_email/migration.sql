-- CreateTable
CREATE TABLE "user_report_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_report_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summary_emails" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "granularity" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "to_address" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "summary_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_report_subscriptions_user_id_scope_type_scope_id_key" ON "user_report_subscriptions"("user_id", "scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "summary_emails_granularity_period_start_idx" ON "summary_emails"("granularity", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "summary_emails_user_id_granularity_period_start_key" ON "summary_emails"("user_id", "granularity", "period_start");

-- AddForeignKey
ALTER TABLE "user_report_subscriptions" ADD CONSTRAINT "user_report_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "summary_emails" ADD CONSTRAINT "summary_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
