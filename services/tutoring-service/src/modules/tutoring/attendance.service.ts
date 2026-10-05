import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, EnrollmentStatus, Prisma, SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { recordSessionEvent } from '../events/domain-events';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { assertActsOnOwnTeacher } from '../teachers/teacher-of-user';
import { AttendanceRecordInput } from './dto/record-attendance.dto';
import { TutoringReportInput } from './dto/session-report.dto';

export const ATTENDANCE_TO_ENROLLMENT_STATUS: Record<AttendanceStatus, EnrollmentStatus> = {
  [AttendanceStatus.PRESENT]: EnrollmentStatus.ATTENDED,
  [AttendanceStatus.ABSENT]: EnrollmentStatus.ABSENT,
  [AttendanceStatus.JUSTIFIED]: EnrollmentStatus.JUSTIFIED,
};

/** Inscripciones que cuentan para la lista (excluye las canceladas). */
const ROLL_STATUSES: EnrollmentStatus[] = [
  EnrollmentStatus.ENROLLED,
  EnrollmentStatus.ATTENDED,
  EnrollmentStatus.ABSENT,
  EnrollmentStatus.JUSTIFIED,
];

type Tx = Prisma.TransactionClient;

/**
 * CU-05 ampliado (pedidos 7/9/2026): el docente toma lista mientras la tutoría está en curso
 * (guardando parcialmente), y al finalizar registra destrezas, observaciones y tareas.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
  ) {}

  /** Guarda la lista (parcial o completa) de una tutoría en curso. */
  async saveAttendance(sessionId: string, records: AttendanceRecordInput[], actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.lockSession(tx, sessionId);
      await assertActsOnOwnTeacher(tx, actor, session.teacherId);
      if (session.status !== SessionStatus.IN_PROGRESS) {
        throw new ConflictException('Solo se puede tomar lista de una tutoría en curso');
      }
      await this.upsertAttendance(tx, sessionId, records);
      return this.enrollmentsWithAttendance(tx, sessionId);
    });
  }

  /**
   * Convierte "estos asistieron" en registros para TODA la lista: los marcados quedan
   * presentes y los demás ausentes (pedido 2026-10-02).
   */
  static async rollFromPresent(tx: Tx, sessionId: string, presentIds: string[]): Promise<AttendanceRecordInput[]> {
    const roll = await tx.tutoringEnrollment.findMany({
      where: { tutoringSessionId: sessionId, status: { in: ROLL_STATUSES } },
      select: { id: true },
    });
    const valid = new Set(roll.map((e) => e.id));
    if (presentIds.some((id) => !valid.has(id))) {
      throw new BadRequestException('Hay estudiantes en la lista que no pertenecen a esta tutoría.');
    }
    const present = new Set(presentIds);
    return roll.map((e) => ({
      enrollmentId: e.id,
      status: present.has(e.id) ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT,
    }));
  }

  /** Registra la lista dentro de una transacción ya abierta (lo usa el inicio de la tutoría). */
  async recordRoll(tx: Tx, sessionId: string, presentIds: string[]) {
    await this.upsertAttendance(tx, sessionId, await AttendanceService.rollFromPresent(tx, sessionId, presentIds));
  }

  /** Finalizar: IN_PROGRESS → COMPLETED. Exige lista completa e informe. */
  async completeSession(
    sessionId: string,
    input: { records?: AttendanceRecordInput[]; presentEnrollmentIds?: string[]; report: TutoringReportInput },
    actor: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.lockSession(tx, sessionId);
      await assertActsOnOwnTeacher(tx, actor, session.teacherId);
      if (session.status !== SessionStatus.IN_PROGRESS) {
        throw new ConflictException('Solo se puede finalizar una tutoría en curso');
      }

      if (input.presentEnrollmentIds) await this.recordRoll(tx, sessionId, input.presentEnrollmentIds);
      else if (input.records?.length) await this.upsertAttendance(tx, sessionId, input.records);
      await this.assertRollComplete(tx, sessionId);
      await this.createReport(tx, sessionId, input.report, actor.userId);

      const updated = await tx.tutoringSession.update({
        where: { id: sessionId },
        data: { status: SessionStatus.COMPLETED, completedAt: new Date() },
      });

      await this.audit.record(tx, {
        userId: actor.userId,
        action: 'COMPLETE',
        entityType: 'TutoringSession',
        entityId: sessionId,
        previousValue: { status: SessionStatus.IN_PROGRESS },
        newValue: { status: SessionStatus.COMPLETED, report: true },
      });
      await recordSessionEvent(tx, 'tutoring.completed', sessionId);
      return updated;
    });
  }

  /**
   * Informe pendiente: el sistema cerró la tutoría a los 40 min (R7) antes de que el docente
   * la finalizara. Permite registrar el informe y corregir la asistencia (los no registrados
   * quedaron como ausentes).
   */
  async submitPendingReport(
    sessionId: string,
    input: { records?: AttendanceRecordInput[]; presentEnrollmentIds?: string[]; report: TutoringReportInput },
    actor: AuthenticatedUser,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.lockSession(tx, sessionId);
      await assertActsOnOwnTeacher(tx, actor, session.teacherId);
      if (session.status !== SessionStatus.COMPLETED) {
        throw new ConflictException('El informe se completa sobre una tutoría finalizada');
      }
      if (await tx.tutoringReport.findUnique({ where: { tutoringSessionId: sessionId } })) {
        throw new ConflictException('Esta tutoría ya tiene su informe registrado');
      }

      if (input.presentEnrollmentIds) await this.recordRoll(tx, sessionId, input.presentEnrollmentIds);
      else if (input.records?.length) await this.upsertAttendance(tx, sessionId, input.records);
      const report = await this.createReport(tx, sessionId, input.report, actor.userId);

      await this.audit.record(tx, {
        userId: actor.userId,
        action: 'REPORT',
        entityType: 'TutoringSession',
        entityId: sessionId,
        newValue: { report: true, attendanceCorrections: input.records?.length ?? 0 },
      });
      await recordSessionEvent(tx, 'tutoring.report_submitted', sessionId);
      return report;
    });
  }

  private async lockSession(tx: Tx, sessionId: string) {
    const rows = await tx.$queryRaw<{ id: string; status: SessionStatus; teacherId: string }[]>`
      SELECT id, status, "teacherId" FROM tutoring_sessions WHERE id = ${sessionId} FOR UPDATE
    `;
    if (!rows[0]) throw new NotFoundException('Tutoría no encontrada');
    return rows[0];
  }

  private async upsertAttendance(tx: Tx, sessionId: string, records: AttendanceRecordInput[]) {
    const enrollments = await tx.tutoringEnrollment.findMany({
      where: { tutoringSessionId: sessionId, status: { in: ROLL_STATUSES } },
      select: { id: true },
    });
    const valid = new Set(enrollments.map((e) => e.id));
    if (records.some((r) => !valid.has(r.enrollmentId))) {
      throw new BadRequestException('Hay estudiantes en la lista que no pertenecen a esta tutoría.');
    }
    for (const r of records) {
      await tx.attendance.upsert({
        where: { enrollmentId: r.enrollmentId },
        create: { enrollmentId: r.enrollmentId, status: r.status, note: r.note },
        update: { status: r.status, note: r.note, recordedAt: new Date() },
      });
      await tx.tutoringEnrollment.update({
        where: { id: r.enrollmentId },
        data: { status: ATTENDANCE_TO_ENROLLMENT_STATUS[r.status] },
      });
    }
  }

  private async assertRollComplete(tx: Tx, sessionId: string) {
    const pending = await tx.tutoringEnrollment.count({
      where: { tutoringSessionId: sessionId, status: { in: ROLL_STATUSES }, attendance: null },
    });
    // Mensaje textual exigido por la pantalla 15 (sección 9.3).
    if (pending > 0) {
      throw new BadRequestException('Debes registrar el estado de todos los estudiantes antes de guardar.');
    }
  }

  private createReport(tx: Tx, sessionId: string, report: TutoringReportInput, userId: string) {
    return tx.tutoringReport.create({
      data: {
        tutoringSessionId: sessionId,
        skills: report.skills.trim(),
        observations: report.observations.trim(),
        tasks: report.tasks?.trim() || null,
        submittedById: userId,
      },
    });
  }

  private enrollmentsWithAttendance(tx: Tx, sessionId: string) {
    return tx.tutoringEnrollment.findMany({
      where: { tutoringSessionId: sessionId, status: { in: ROLL_STATUSES } },
      include: { student: true, attendance: true },
    });
  }
}
