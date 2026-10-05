-- Cupo por tutoría: de 5 a 10 estudiantes (pedido 2026-10-05).
-- Se amplía en los bloques libres y en las tutorías que aún no terminan; las finalizadas y
-- canceladas conservan el cupo con el que ocurrieron (historial).
ALTER TABLE "tutoring_sessions" ALTER COLUMN "capacity" SET DEFAULT 10;
UPDATE "tutoring_sessions"
SET "capacity" = 10
WHERE "status" IN ('AVAILABLE', 'SCHEDULED', 'IN_PROGRESS') AND "capacity" < 10;
