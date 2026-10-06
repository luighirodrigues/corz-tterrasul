-- Reversão manual da migração 5_resumo_email (o Prisma não executa este arquivo).
-- Antes: voltar o código para o commit anterior, que não usa estas tabelas. Plano: docs/PLANO_RESUMO_EMAIL.md.
-- Apaga as assinaturas de resumo e o registro dos envios (usuários, conversas e relatórios não são tocados).
DROP TABLE IF EXISTS "summary_emails";
DROP TABLE IF EXISTS "user_report_subscriptions";
DELETE FROM "_prisma_migrations" WHERE migration_name = '5_resumo_email';
