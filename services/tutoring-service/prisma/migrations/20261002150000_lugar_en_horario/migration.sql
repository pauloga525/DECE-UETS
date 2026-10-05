-- El docente declara el lugar de sus tutorías en su horario (pedido 2026-10-02); los bloques
-- generados lo copian y ya no hay que escribirlo al agendar.
-- AlterTable
ALTER TABLE "teacher_availability_rules" ADD COLUMN     "location" TEXT;

