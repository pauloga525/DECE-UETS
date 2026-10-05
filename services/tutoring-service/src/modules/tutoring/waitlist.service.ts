import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, SessionStatus, WaitlistStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { recordSessionEvent } from '../events/domain-events';
import { AddToWaitlistDto } from './dto/waitlist.dto';
import {
  ACTIVE_ENROLLMENT_STATUSES,
  assertNoStudentOverlap,
  assertStudentBelongsToLevel,
  enrollStudent,
} from './overlap.util';

/** CU-08: lista de espera y promoción automática (regla 12, sección 4 · pantalla 13). */
@Injectable()
export class WaitlistService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
  ) {}

  async addToWaitlist(sessionId: string, dto: AddToWaitlistDto, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.tutoringSession.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundException('Tutoría no encontrada');
      if (session.status !== SessionStatus.SCHEDULED) {
        throw new ConflictException('Solo se puede usar lista de espera en una tutoría programada');
      }
      const activeCount = await tx.tutoringEnrollment.count({
        where: { tutoringSessionId: sessionId, status: { in: ACTIVE_ENROLLMENT_STATUSES } },
      });
      if (activeCount < session.capacity) {
        throw new BadRequestException('Este bloque todavía tiene cupos disponibles');
      }

      await assertStudentBelongsToLevel(tx, dto.studentId, session.levelId, session.teacherAssignmentId);

      const lastPosition = await tx.waitlist.count({
        where: { tutoringSessionId: sessionId, status: WaitlistStatus.WAITING },
      });

      const entry = await tx.waitlist.create({
        data: {
          tutoringSessionId: sessionId,
          studentId: dto.studentId,
          reason: dto.reason,
          reasonNote: dto.reasonNote,
          position: lastPosition + 1,
        },
      });

      await this.audit.record(tx, {
        userId: actorUserId,
        action: 'WAITLIST_ADD',
        entityType: 'TutoringSession',
        entityId: sessionId,
        newValue: { studentId: dto.studentId, position: entry.position },
      });

      return entry;
    });
  }

  /**
   * Cancela una inscripción y, si hay lista de espera para el mismo bloque, promueve
   * automáticamente al primero en la cola (regla 12) dentro de la misma transacción.
   */
  async cancelEnrollment(enrollmentId: string, actorUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.tutoringEnrollment.findUnique({
        where: { id: enrollmentId },
        include: { tutoringSession: true },
      });
      if (!enrollment) throw new NotFoundException('Inscripción no encontrada');
      if (!ACTIVE_ENROLLMENT_STATUSES.includes(enrollment.status)) {
        throw new ConflictException('Esta inscripción ya no está activa');
      }

      await tx.tutoringEnrollment.update({
        where: { id: enrollmentId },
        data: { status: EnrollmentStatus.CANCELLED },
      });

      await this.audit.record(tx, {
        userId: actorUserId,
        action: 'ENROLLMENT_CANCEL',
        entityType: 'TutoringEnrollment',
        entityId: enrollmentId,
        previousValue: { status: enrollment.status },
        newValue: { status: EnrollmentStatus.CANCELLED },
      });

      const nextInLine = await tx.waitlist.findFirst({
        where: { tutoringSessionId: enrollment.tutoringSessionId, status: WaitlistStatus.WAITING },
        orderBy: { position: 'asc' },
      });
      if (!nextInLine) return { cancelledEnrollmentId: enrollmentId, promoted: null };

      await assertStudentBelongsToLevel(
        tx,
        nextInLine.studentId,
        enrollment.tutoringSession.levelId,
        enrollment.tutoringSession.teacherAssignmentId,
      );

      await assertNoStudentOverlap(
        tx,
        [{ studentId: nextInLine.studentId }],
        enrollment.tutoringSession,
      );

      const promotedEnrollment = await enrollStudent(tx, {
        tutoringSessionId: enrollment.tutoringSessionId,
        studentId: nextInLine.studentId,
        reason: nextInLine.reason,
        reasonNote: nextInLine.reasonNote,
        createdById: actorUserId,
      });
      await tx.waitlist.update({
        where: { id: nextInLine.id },
        data: { status: WaitlistStatus.PROMOTED, promotedAt: new Date() },
      });

      await this.audit.record(tx, {
        userId: actorUserId,
        action: 'WAITLIST_PROMOTE',
        entityType: 'TutoringSession',
        entityId: enrollment.tutoringSessionId,
        newValue: { studentId: nextInLine.studentId, enrollmentId: promotedEnrollment.id },
      });

      // El promovido pasa a estar inscrito: su representante recibe la invitación.
      await recordSessionEvent(tx, 'tutoring.enrollments_added', promotedEnrollment.tutoringSessionId, {
        studentIds: [nextInLine.studentId],
      });
      return { cancelledEnrollmentId: enrollmentId, promoted: promotedEnrollment };
    });
  }
}
