-- Materias técnicas (pedido 2026-10-23): sus horarios de tutoría pueden cruzarse entre sí.
ALTER TABLE "subjects" ADD COLUMN "isTechnical" BOOLEAN NOT NULL DEFAULT false;
-- Módulos de especialidad ("MOD. ..."), Dibujo técnico y Programación.
UPDATE "subjects" SET "isTechnical" = true
 WHERE "code" LIKE 'MOD-%' OR "code" LIKE 'DIBUJO-TECNICO%' OR "code" LIKE 'PROGRAMACION%';

-- Clave del bloque: materia + curso (las especialidades hermanas comparten bloque).
ALTER TABLE "tutoring_sessions" ADD COLUMN "slotKey" TEXT NOT NULL DEFAULT '';
UPDATE "tutoring_sessions" s
   SET "slotKey" = s."subjectId" || ':' ||
       CASE WHEN l."grade" IS NOT NULL AND l."educationLevel" IS NOT NULL
            THEN l."educationLevel" || '#' || l."grade" ELSE l."id" END
  FROM "levels" l
 WHERE l."id" = s."levelId";

DROP INDEX "tutoring_sessions_teacherId_date_startTime_key";
CREATE UNIQUE INDEX "tutoring_sessions_teacherId_date_startTime_slotKey_key"
    ON "tutoring_sessions"("teacherId", "date", "startTime", "slotKey");
