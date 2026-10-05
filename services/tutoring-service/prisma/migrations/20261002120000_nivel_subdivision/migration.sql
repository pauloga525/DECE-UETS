-- Carga de alumnos reales (2026-10-02): el curso se guarda subdividido en el nivel.
-- AlterTable
ALTER TABLE "levels" ADD COLUMN     "educationLevel" TEXT,
ADD COLUMN     "grade" INTEGER,
ADD COLUMN     "stage" TEXT;

