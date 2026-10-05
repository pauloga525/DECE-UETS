import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EnrollmentStatus, SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { recordSessionEvent } from '../events/domain-events';
import { AttendanceService } from './attendance.service';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { assertActsOnOwnTeacher } from '../teachers/teacher-of-user';
import { minutesToTime, sessionInstant, START_EARLY_MINUTES, timeToMinutes } from '../../common/time.util';
import { ScheduleSessionDto, StudentEnrollmentInput } from './dto/schedule-session.dto';
import {
  ACTIVE_ENROLLMENT_STATUSES,
  assertNoStudentOverlap,
  assertStudentBelongsToLevel,
  enrollStudent,
} from './overlap.util';

interface LockedSessionRow {
  id: string;
  status: SessionStatus;
  capacity: number;
  teacherId: string;
  subjectId: string;
  levelId: string;
  teacherAssignmentId: string;
  parallelId: string | null;
  academicPeriodId: string;
  date: Date;
  startTime: string;
  endTime: string;
  location?: string | null;
}

@Injectable()
export class TutoringSessionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
    private attendance: AttendanceService,
  ) {}

  /** Vista de agenda (pantalla 07): docentes en columnas, bloques de 40 min en filas. */
  findAgenda(filters: {
    date?: string;
    from?: string;
    to?: string;
    teacherId?: string;
    status?: SessionStatus;
  }) {
    return this.prisma.tutoringSession.findMany({
      where: {
        // date exacta, o rango [from, to] para la vista de calendario (semana/mes).
        date: filters.date
          ? new Date(filters.date)
          : filters.from || filters.to
            ? {
                gte: filters.from ? new Date(filters.from) : undefined,
                lte: filters.to ? new Date(filters.to) : undefined,
              }
            : undefined,
        teacherId: filters.teacherId,
        status: filters.status,
      },
      include: { teacher: true, subject: true, level: true, parallel: true, enrollments: true },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  async findOne(id: string) {
    const session = await this.prisma.tutoringSession.findUnique({
      where: { id },
      include: {
        teacher: true,
        subject: true,
        level: true,
        parallel: true,
        enrollments: { include: { student: { include: { parallel: true } }, attendance: true } },
        waitlist: { include: { student: { include: { parallel: true } } }, orderBy: { position: 'asc' } },
        report: true,
      },
    });
    if (!session) throw new NotFoundException('Tutoría no encontrada');
    // Instantes absolutos calculados en el servidor: el cronómetro del frontend cuenta contra
    // estos (no contra el reloj del equipo del docente, que puede estar desfasado).
    return {
      ...session,
      timing: {
        startsAt: sessionInstant(session.date, session.startTime).toISOString(),
        endsAt: sessionInstant(session.date, session.endTime).toISOString(),
        serverNow: new Date().toISOString(),
      },
    };
  }

  /**
   * Bloques elegibles de un docente en una fecha — paso 3 del flujo de creación (sección 6).
   * Ya vienen con materia y nivel puestos (heredados de la TeacherAssignment de la regla que
   * los generó), así que la pantalla de Agenda/Crear tutoría puede mostrarlos directamente.
   *
   * Incluye tanto bloques AVAILABLE (para agendar una tutoría nueva) como bloques ya
   * SCHEDULED con cupo libre (para sumar estudiantes a una tutoría existente) — antes solo se
   * mostraban los AVAILABLE, lo que hacía "desaparecer" un bloque con cupo apenas se agendaba
   * el primer estudiante, aunque quedaran 4 lugares libres.
   */
  async findAvailableBlocks(teacherId: string, date: string) {
    const sessions = await this.prisma.tutoringSession.findMany({
      where: {
        teacherId,
        date: new Date(date),
        status: { in: [SessionStatus.AVAILABLE, SessionStatus.SCHEDULED] },
      },
      include: {
        subject: true,
        level: true,
        parallel: true,
        enrollments: { where: { status: { in: ACTIVE_ENROLLMENT_STATUSES } } },
      },
      orderBy: { startTime: 'asc' },
    });
    return sessions.filter(
      (s) => s.status === SessionStatus.AVAILABLE || s.enrollments.length < s.capacity,
    );
  }

  /**
   * CU-03: convierte un bloque AVAILABLE en SCHEDULED con su primera tanda de estudiantes.
   * Materia y nivel ya vienen fijos desde que el bloque se generó — el DECE solo define
   * paralelo y estudiantes, no elige materia/nivel (cambio de lógica pedido por Paulo).
   * Bloqueo pesimista (sección 7 del plan): `SELECT ... FOR UPDATE` sobre la fila de la sesión
   * serializa cualquier otra petición concurrente sobre el mismo bloque — es lo que evita el 6/5
   * (DoD de la Fase 2). No usar `prisma.tutoringSession.findUnique` aquí: no toma lock.
   */
  async scheduleSession(sessionId: string, dto: ScheduleSessionDto, actor: AuthenticatedUser) {
    const actorUserId = actor.userId;
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedSessionRow[]>`
        SELECT id, status, capacity, "teacherId", "subjectId", "levelId", "parallelId", "teacherAssignmentId",
               "academicPeriodId", date, "startTime", "endTime", location
        FROM tutoring_sessions WHERE id = ${sessionId} FOR UPDATE
      `;
      const session = rows[0];
      if (!session) throw new NotFoundException('Tutoría no encontrada');
      const location = dto.location?.trim() || session.location?.trim();
      if (!location) {
        throw new BadRequestException(
          'Indica el lugar de la tutoría (o regístralo en el horario del docente para que se tome solo).',
        );
      }
      // El docente solo agenda en sus propios bloques; el DECE, en los de cualquier docente.
      await assertActsOnOwnTeacher(tx, actor, session.teacherId);
      if (session.status !== SessionStatus.AVAILABLE) {
        throw new ConflictException('Este bloque ya no está disponible');
      }
      if (dto.students.length > session.capacity) {
        throw new ConflictException(
          `Esta tutoría tiene ${session.capacity} de ${session.capacity} estudiantes.`,
        );
      }

      for (const student of dto.students) {
        await assertStudentBelongsToLevel(tx, student.studentId, session.levelId, session.teacherAssignmentId);
      }

      await assertNoStudentOverlap(tx, dto.students, session);

      await tx.tutoringSession.update({
        where: { id: sessionId },
        data: {
          // Sin paralelo propio: puede reunir alumnos de varios paralelos del nivel.
          parallelId: null,
          status: SessionStatus.SCHEDULED,
          location,
        },
      });

      for (const student of dto.students) {
        await enrollStudent(tx, {
          tutoringSessionId: sessionId,
          studentId: student.studentId,
          reason: student.reason,
          reasonNote: student.reasonNote,
          createdById: actorUserId,
        });
      }

      await this.audit.record(tx, {
        userId: actorUserId,
        action: 'SCHEDULE',
        entityType: 'TutoringSession',
        entityId: sessionId,
        previousValue: { status: SessionStatus.AVAILABLE },
        newValue: {
          status: SessionStatus.SCHEDULED,
          location,
          studentCount: dto.students.length,
        },
      });
      await recordSessionEvent(tx, 'tutoring.scheduled', sessionId);

      return tx.tutoringSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: { enrollments: true, subject: true, level: true, parallel: true },
      });
    });
  }

  /** CU-04: agrega estudiantes a un bloque ya SCHEDULED. Misma disciplina de bloqueo que scheduleSession. */
  async addEnrollments(
    sessionId: string,
    students: StudentEnrollmentInput[],
    actor: AuthenticatedUser,
  ) {
    const actorUserId = actor.userId;
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedSessionRow[]>`
        SELECT id, status, capacity, "teacherId", "subjectId", "levelId", "parallelId", "teacherAssignmentId",
               "academicPeriodId", date, "startTime", "endTime"
        FROM tutoring_sessions WHERE id = ${sessionId} FOR UPDATE
      `;
      const session = rows[0];
      if (!session) throw new NotFoundException('Tutoría no encontrada');
      await assertActsOnOwnTeacher(tx, actor, session.teacherId);
      if (session.status !== SessionStatus.SCHEDULED) {
        throw new ConflictException('Solo se pueden agregar estudiantes a una tutoría programada');
      }
      const currentCount = await tx.tutoringEnrollment.count({
        where: { tutoringSessionId: sessionId, status: { in: ACTIVE_ENROLLMENT_STATUSES } },
      });
      if (currentCount + students.length > session.capacity) {
        throw new ConflictException(
          `Esta tutoría tiene ${session.capacity} de ${session.capacity} estudiantes.`,
        );
      }

      for (const student of students) {
        await assertStudentBelongsToLevel(tx, student.studentId, session.levelId, session.teacherAssignmentId);
      }

      await assertNoStudentOverlap(tx, students, session);

      for (const student of students) {
        await enrollStudent(tx, {
          tutoringSessionId: sessionId,
          studentId: student.studentId,
          reason: student.reason,
          reasonNote: student.reasonNote,
          createdById: actorUserId,
        });
      }

      await this.audit.record(tx, {
        userId: actorUserId,
        action: 'ENROLL',
        entityType: 'TutoringSession',
        entityId: sessionId,
        newValue: { addedStudents: students.map((s) => s.studentId) },
      });
      await recordSessionEvent(tx, 'tutoring.enrollments_added', sessionId, {
        studentIds: students.map((s) => s.studentId),
      });

      return tx.tutoringEnrollment.findMany({
        where: { tutoringSessionId: sessionId },
        include: { student: true },
      });
    });
  }

  /**
   * CU-05: el docente marca el inicio del bloque. Regla 4: a partir de aquí la materia/nivel/
   * paralelo quedan fijos. Pedidos 7/9/2026:
   *  - solo el docente de la tutoría (o un admin) puede iniciarla;
   *  - no puede iniciar otra mientras tenga una en curso;
   *  - solo dentro de su horario: desde START_EARLY_MINUTES antes del inicio hasta el fin.
   */
  async startSession(
    sessionId: string,
    actor: AuthenticatedUser,
    now = new Date(),
    presentEnrollmentIds?: string[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedSessionRow[]>`
        SELECT id, status, capacity, "teacherId", "subjectId", "levelId", "parallelId", "teacherAssignmentId",
               "academicPeriodId", date, "startTime", "endTime"
        FROM tutoring_sessions WHERE id = ${sessionId} FOR UPDATE
      `;
      const session = rows[0];
      if (!session) throw new NotFoundException('Tutoría no encontrada');
      await assertActsOnOwnTeacher(tx, actor, session.teacherId);
      if (session.status !== SessionStatus.SCHEDULED) {
        throw new ConflictException('Solo se puede iniciar una tutoría programada');
      }

      const opensAt = sessionInstant(session.date, session.startTime).getTime() - START_EARLY_MINUTES * 60_000;
      const endsAt = sessionInstant(session.date, session.endTime).getTime();
      if (now.getTime() < opensAt || now.getTime() >= endsAt) {
        const from = minutesToTime(timeToMinutes(session.startTime) - START_EARLY_MINUTES);
        throw new ConflictException(
          `Esta tutoría solo puede iniciarse el día programado entre las ${from} y las ${session.endTime}.`,
        );
      }

      // Serializa los inicios de un mismo docente: dos "Iniciar" simultáneos sobre bloques
      // distintos toman locks de filas distintas, así que el FOR UPDATE de arriba no basta.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.teacherId}))`;
      const active = await tx.tutoringSession.findFirst({
        where: { teacherId: session.teacherId, status: SessionStatus.IN_PROGRESS, id: { not: sessionId } },
      });
      if (active) {
        throw new ConflictException(
          `Tienes otra tutoría en curso (${active.startTime}–${active.endTime}). Finalízala antes de iniciar una nueva.`,
        );
      }

      const updated = await tx.tutoringSession.update({
        where: { id: sessionId },
        data: { status: SessionStatus.IN_PROGRESS, startedAt: now },
      });
      // Lista al iniciar (pedido 2026-10-02): presentes y ausentes viajan en el correo de inicio.
      if (presentEnrollmentIds) await this.attendance.recordRoll(tx, sessionId, presentEnrollmentIds);
      await this.audit.record(tx, {
        userId: actor.userId,
        action: 'START',
        entityType: 'TutoringSession',
        entityId: sessionId,
        previousValue: { status: SessionStatus.SCHEDULED },
        newValue: { status: SessionStatus.IN_PROGRESS },
      });
      await recordSessionEvent(tx, 'tutoring.started', sessionId);
      return updated;
    });
  }

  /**
   * CU-06: cancelación no destructiva (regla 14) — cambia de estado, nunca borra el registro.
   * Cancela en cascada las inscripciones activas de la sesión.
   */
  async cancelSession(sessionId: string, reason: string, actor: AuthenticatedUser) {
    const actorUserId = actor.userId;
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedSessionRow[]>`
        SELECT id, status, capacity, "teacherId", "subjectId", "levelId", "parallelId", "teacherAssignmentId",
               "academicPeriodId", date, "startTime", "endTime"
        FROM tutoring_sessions WHERE id = ${sessionId} FOR UPDATE
      `;
      const session = rows[0];
      if (!session) throw new NotFoundException('Tutoría no encontrada');
      await assertActsOnOwnTeacher(tx, actor, session.teacherId);
      if (
        session.status === SessionStatus.COMPLETED ||
        session.status === SessionStatus.CANCELLED
      ) {
        throw new ConflictException(
          'Esta tutoría ya finalizó o fue cancelada y no puede cancelarse de nuevo',
        );
      }

      await tx.tutoringEnrollment.updateMany({
        where: { tutoringSessionId: sessionId, status: { in: ACTIVE_ENROLLMENT_STATUSES } },
        data: { status: EnrollmentStatus.CANCELLED },
      });

      const updated = await tx.tutoringSession.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.CANCELLED,
          cancelReason: reason,
          cancelledById: actorUserId,
          cancelledAt: new Date(),
        },
      });

      await this.audit.record(tx, {
        userId: actorUserId,
        action: 'CANCEL',
        entityType: 'TutoringSession',
        entityId: sessionId,
        previousValue: { status: session.status },
        newValue: { status: SessionStatus.CANCELLED, reason },
      });
      // Un bloque libre cancelado no tiene a quién avisar.
      if (session.status !== SessionStatus.AVAILABLE) {
        await recordSessionEvent(tx, 'tutoring.cancelled', sessionId);
      }

      return updated;
    });
  }

  /**
   * CU-07: reprograma moviendo la tutoría a un bloque AVAILABLE distinto, revalidando todo
   * (regla 13): el bloque destino debe ser de la misma materia y nivel (cada bloque ya trae
   * los suyos fijos — no se pueden "cambiar" al reprogramar), con capacidad suficiente y sin
   * solapes para cada estudiante inscrito en el nuevo horario. El bloque original queda
   * CANCELLED (no se borra); el bloque destino pasa a SCHEDULED con las inscripciones movidas.
   */
  async rescheduleSession(oldSessionId: string, newSessionId: string, actorUserId: string) {
    if (oldSessionId === newSessionId) {
      throw new BadRequestException('El nuevo bloque debe ser distinto del actual');
    }
    return this.prisma.$transaction(async (tx) => {
      // Orden de lock consistente (por id) para evitar deadlocks entre reprogramaciones cruzadas.
      const [firstId, secondId] = [oldSessionId, newSessionId].sort();
      const [firstRows, secondRows] = [
        await tx.$queryRaw<LockedSessionRow[]>`
          SELECT id, status, capacity, "teacherId", "subjectId", "levelId", "parallelId", "teacherAssignmentId",
                 "academicPeriodId", date, "startTime", "endTime"
          FROM tutoring_sessions WHERE id = ${firstId} FOR UPDATE
        `,
        await tx.$queryRaw<LockedSessionRow[]>`
          SELECT id, status, capacity, "teacherId", "subjectId", "levelId", "parallelId", "teacherAssignmentId",
                 "academicPeriodId", date, "startTime", "endTime"
          FROM tutoring_sessions WHERE id = ${secondId} FOR UPDATE
        `,
      ];
      const byId = new Map([...firstRows, ...secondRows].map((r) => [r.id, r]));
      const oldSession = byId.get(oldSessionId);
      const newSession = byId.get(newSessionId);
      if (!oldSession || !newSession) throw new NotFoundException('Tutoría no encontrada');

      if (oldSession.status !== SessionStatus.SCHEDULED) {
        throw new ConflictException('Solo se puede reprogramar una tutoría programada');
      }
      if (newSession.status !== SessionStatus.AVAILABLE) {
        throw new ConflictException('El bloque destino no está disponible');
      }
      if (
        oldSession.subjectId !== newSession.subjectId ||
        oldSession.levelId !== newSession.levelId
      ) {
        throw new BadRequestException('El bloque destino debe ser de la misma materia y nivel');
      }

      const activeEnrollments = await tx.tutoringEnrollment.findMany({
        where: { tutoringSessionId: oldSessionId, status: { in: ACTIVE_ENROLLMENT_STATUSES } },
      });
      if (activeEnrollments.length > newSession.capacity) {
        throw new ConflictException('El nuevo bloque no tiene capacidad suficiente');
      }

      await assertNoStudentOverlap(
        tx,
        activeEnrollments.map((e) => ({
          studentId: e.studentId,
          reason: e.reason,
          reasonNote: e.reasonNote ?? undefined,
        })),
        newSession,
      );

      await tx.tutoringEnrollment.updateMany({
        where: { tutoringSessionId: oldSessionId, status: { in: ACTIVE_ENROLLMENT_STATUSES } },
        data: { tutoringSessionId: newSessionId },
      });

      await tx.tutoringSession.update({
        where: { id: newSessionId },
        data: {
          parallelId: oldSession.parallelId,
          status: SessionStatus.SCHEDULED,
          location: (await tx.tutoringSession.findUnique({ where: { id: oldSessionId } }))?.location,
        },
      });

      const updatedOld = await tx.tutoringSession.update({
        where: { id: oldSessionId },
        data: {
          status: SessionStatus.CANCELLED,
          cancelReason: `Reprogramada al bloque ${newSessionId}`,
          cancelledById: actorUserId,
          cancelledAt: new Date(),
        },
      });

      await this.audit.record(tx, {
        userId: actorUserId,
        action: 'RESCHEDULE',
        entityType: 'TutoringSession',
        entityId: oldSessionId,
        previousValue: { status: SessionStatus.SCHEDULED },
        newValue: { status: SessionStatus.CANCELLED, movedToSessionId: newSessionId },
      });
      await recordSessionEvent(tx, 'tutoring.rescheduled', newSessionId, {
        previous: {
          sessionId: oldSessionId,
          date: oldSession.date.toISOString().slice(0, 10),
          startTime: oldSession.startTime,
          endTime: oldSession.endTime,
        },
      });

      return {
        previousSession: updatedOld,
        newSession: await tx.tutoringSession.findUniqueOrThrow({ where: { id: newSessionId } }),
      };
    });
  }
}
