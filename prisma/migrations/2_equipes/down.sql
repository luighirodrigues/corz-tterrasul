-- Reversão manual da migração 2_equipes (o Prisma não executa este arquivo).
-- Antes: voltar o código para o commit anterior. Plano: docs/PLANO_EQUIPES.md (E9.4).
DELETE FROM period_reports WHERE scope_type = 'equipe';
DROP INDEX IF EXISTS "sessions_tenant_id_department_id_idx";
DROP TABLE IF EXISTS "departments";
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "team_groups", DROP COLUMN IF EXISTS "ignored_teams";
DELETE FROM "_prisma_migrations" WHERE migration_name = '2_equipes';
