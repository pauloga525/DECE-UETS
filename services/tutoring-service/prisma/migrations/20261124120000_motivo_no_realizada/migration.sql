-- Motivo por el que el docente no realizó una tutoría programada (pedido 2026-11-24).
ALTER TABLE "tutoring_sessions" ADD COLUMN "notHeldReason" TEXT;
ALTER TABLE "tutoring_sessions" ADD COLUMN "notHeldReasonAt" TIMESTAMP(3);
