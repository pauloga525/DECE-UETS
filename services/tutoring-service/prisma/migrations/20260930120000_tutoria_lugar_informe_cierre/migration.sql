-- Pedidos 7/9/2026: lugar de la tutoría (R4), marcas de inicio/cierre y cierre automático
-- a los 40 min (R7), e informe de cierre del docente con destrezas, observaciones y tareas (R6).

-- AlterTable
ALTER TABLE "tutoring_sessions" ADD COLUMN     "autoCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "location" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "tutoring_reports" (
    "id" TEXT NOT NULL,
    "tutoringSessionId" TEXT NOT NULL,
    "skills" TEXT NOT NULL,
    "observations" TEXT NOT NULL,
    "tasks" TEXT,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tutoring_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tutoring_reports_tutoringSessionId_key" ON "tutoring_reports"("tutoringSessionId");

-- AddForeignKey
ALTER TABLE "tutoring_reports" ADD CONSTRAINT "tutoring_reports_tutoringSessionId_fkey" FOREIGN KEY ("tutoringSessionId") REFERENCES "tutoring_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutoring_reports" ADD CONSTRAINT "tutoring_reports_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Usuario técnico que firma en audit_logs las acciones automáticas (cierre a los 40 min).
-- Inactivo: no corresponde a ninguna persona ni puede iniciar sesión.
INSERT INTO "users" ("id", "email", "role", "isActive", "createdAt", "updatedAt")
VALUES ('system', 'sistema@uets.edu.ec', 'ADMIN', false, now(), now())
ON CONFLICT ("id") DO NOTHING;
