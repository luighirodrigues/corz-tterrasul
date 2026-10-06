-- Reversão manual da migração 6_resumo_diario (o Prisma não executa este arquivo).
-- Antes: voltar o código para o commit anterior, que não usa estas colunas. Plano: docs/PLANO_RESUMO_DIARIO.md.
-- Apaga as três colunas de frequência e o registro dos envios diários (usuários e relatórios não são tocados).
DELETE FROM "summary_emails" WHERE "granularity" = 'dia';
ALTER TABLE "users" DROP COLUMN IF EXISTS "resumo_dia";
ALTER TABLE "users" DROP COLUMN IF EXISTS "resumo_semana";
ALTER TABLE "users" DROP COLUMN IF EXISTS "resumo_mes";
DELETE FROM "_prisma_migrations" WHERE migration_name = '6_resumo_diario';
