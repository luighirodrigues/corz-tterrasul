-- Reversão manual da migração 4_usuarios (o Prisma não executa este arquivo).
-- Antes: voltar o código para o commit anterior, que ainda usa o Basic Auth. Plano: docs/PLANO_USUARIOS.md.
-- Apaga todos os usuários e sessões de login (as conversas e os relatórios não são tocados).
DROP TABLE IF EXISTS "user_sessions";
DROP TABLE IF EXISTS "users";
DELETE FROM "_prisma_migrations" WHERE migration_name = '4_usuarios';
