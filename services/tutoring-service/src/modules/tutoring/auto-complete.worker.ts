import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttendanceStatus, EnrollmentStatus, SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { recordSessionEvent } from '../events/domain-events';
import { sessionInstant } from '../../common/time.util';

/** Usuario técnico que firma en auditoría las acciones automáticas (migración tutoria_lugar_informe_cierre). */
export const SYSTEM_USER_ID = 'system';

/**
 * R7 (pedido 7/9/2026): una tutoría queda finalizada cuando se cumple su bloque de 40 min,
 * aunque el docente no haya pulsado "Finalizar".
 *
 *  - EN CURSO vencida → COMPLETED; los estudiantes sin asistencia registrada quedan AUSENTES
 *    (el docente puede corregirlo al completar el informe pendiente).
 *  - PROGRAMADA vencida (nunca se inició) → COMPLETED sin tocar la asistencia: no se culpa a
 *    los estudiantes de una tutoría que no ocurrió. startedAt = null la distingue.
 *
 * Idempotente y seguro con varias réplicas: cada sesión se re-verifica bajo FOR UPDATE.
 */
@Injectable()
export class AutoCompleteWorker {
  private readonly log = new Logger(AutoCompleteWorker.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    try {
      const closed = await this.closeExpired();
      if (closed.length) this.log.log(`Tutorías cerradas automáticamente: ${closed.length}`);
    } catch (e) {
      this.log.error(`Error cerrando tutorías vencidas: ${(e as Error).message}`);
    }
  }

  /** Devuelve los ids cerrados en esta pasada (público para pruebas). */
  async closeExpired(now = new Date()): Promise<string[]> {
    // Candidatas gruesas por fecha (hasta mañana en UTC, por el desfase horario); el corte
    // exacto se hace con la hora de fin real de cada una.
    const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const candidates = await this.prisma.tutoringSession.findMany({
      where: {
        status: { in: [SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS] },
        date: { lte: until },
      },
      select: { id: true, date: true, endTime: true },
    });
    const expired = candidates.filter((s) => sessionInstant(s.date, s.endTime) <= now);

    const closed: string[] = [];
    for (const { id } of expired) {
      if (await this.closeOne(id, now)) closed.push(id);
    }
    return closed;
  }

  private closeOne(sessionId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ status: SessionStatus }[]>`
        SELECT status FROM tutoring_sessions WHERE id = ${sessionId} FOR UPDATE
      `;
      const status = rows[0]?.status;
      if (status !== SessionStatus.SCHEDULED && status !== SessionStatus.IN_PROGRESS) return false;

      let markedAbsent = 0;
      let absentStudentIds: string[] = [];
      if (status === SessionStatus.IN_PROGRESS) {
        const unrecorded = await tx.tutoringEnrollment.findMany({
          where: { tutoringSessionId: sessionId, status: EnrollmentStatus.ENROLLED, attendance: null },
          select: { id: true, studentId: true },
        });
        for (const e of unrecorded) {
          await tx.attendance.create({
            data: { enrollmentId: e.id, status: AttendanceStatus.ABSENT, note: 'Registrado automáticamente al finalizar el bloque' },
          });
          await tx.tutoringEnrollment.update({ where: { id: e.id }, data: { status: EnrollmentStatus.ABSENT } });
        }
        markedAbsent = unrecorded.length;
        absentStudentIds = unrecorded.map((e) => e.studentId);
      }

      await tx.tutoringSession.update({
        where: { id: sessionId },
        data: { status: SessionStatus.COMPLETED, completedAt: now, autoCompleted: true },
      });
      await this.audit.record(tx, {
        userId: SYSTEM_USER_ID,
        action: 'AUTO_COMPLETE',
        entityType: 'TutoringSession',
        entityId: sessionId,
        previousValue: { status },
        newValue: { status: SessionStatus.COMPLETED, notStarted: status === SessionStatus.SCHEDULED, markedAbsent },
      });
      await recordSessionEvent(tx, 'tutoring.auto_closed', sessionId, {
        notStarted: status === SessionStatus.SCHEDULED,
        autoAbsentStudentIds: absentStudentIds,
      });
      return true;
    });
  }
}
