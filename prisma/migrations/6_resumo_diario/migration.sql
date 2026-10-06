-- AlterTable
ALTER TABLE "users" ADD COLUMN     "resumo_dia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resumo_mes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "resumo_semana" BOOLEAN NOT NULL DEFAULT true;
