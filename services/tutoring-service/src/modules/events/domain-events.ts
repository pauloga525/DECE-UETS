import { Prisma } from '@prisma/client';
import { sessionInstant } from '../../common/time.util';

type Tx = Prisma.TransactionClient;

/**
 * Eventos de dominio que publica tutorías. El notification-service decide a quién escribir y
 * qué plantilla usar (matriz de destinatarios del plan, Fase C) — tutorías no sabe de correos.
 */
export type TutoringEventType =
  | 'tutoring.scheduled'
  | 'tutoring.enrollments_added'
  | 'tutoring.started'
  | 'tutoring.completed'
  | 'tutoring.auto_closed'
  | 'tutoring.report_submitted'
  | 'tutoring.cancelled'
  | 'tutoring.rescheduled';

/**
 * Foto completa de la tutoría en el momento del evento: el notification-service no consulta
 * la base de tutorías (database-per-service), todo lo que necesita viaja aquí.
 */
export async function sessionSnapshot(tx: Tx, sessionId: string) {
  const s = await tx.tutoringSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      teacher: true,
      subject: true,
      level: true,
      parallel: true,
      report: true,
      enrollments: {
        include: {
          attendance: true,
          student: {
            include: { parallel: true, guardians: { where: { notifications: true }, include: { guardian: true } } },
          },
        },
      },
    },
  });
  return {
    session: {
      id: s.id,
      status: s.status,
      date: s.date.toISOString().slice(0, 10),
      startTime: s.startTime,
      endTime: s.endTime,
      startsAt: sessionInstant(s.date, s.startTime).toISOString(),
      endsAt: sessionInstant(s.date, s.endTime).toISOString(),
      location: s.location,
      subject: s.subject.name,
      level: s.level.name,
      parallel: s.parallel?.name ?? null,
      autoCompleted: s.autoCompleted,
      startedAt: s.startedAt?.toISOString() ?? null,
      cancelReason: s.cancelReason,
    },
    teacher: {
      id: s.teacher.id,
      name: `${s.teacher.firstName} ${s.teacher.lastName}`,
      email: s.teacher.email,
    },
    students: s.enrollments.map((e) => ({
      id: e.student.id,
      enrollmentId: e.id,
      name: `${e.student.firstName} ${e.student.lastName}`,
      parallel: e.student.parallel.name,
      enrollmentStatus: e.status,
      attendance: e.attendance?.status ?? null,
      guardians: e.student.guardians
        .filter((g) => !!g.guardian.email)
        .map((g) => ({
          name: `${g.guardian.firstName} ${g.guardian.lastName}`,
          email: g.guardian.email as string,
          relationship: g.relationship,
        })),
    })),
    report: s.report
      ? { skills: s.report.skills, observations: s.report.observations, tasks: s.report.tasks }
      : null,
  };
}

export type SessionSnapshot = Awaited<ReturnType<typeof sessionSnapshot>>;

/** Encola el evento en la misma transacción que el cambio (transactional outbox). */
export async function recordEvent(
  tx: Tx,
  type: TutoringEventType,
  aggregateId: string,
  payload: Record<string, unknown>,
) {
  await tx.domainEvent.create({
    data: { type, aggregateId, payload: payload as Prisma.InputJsonValue },
  });
}

/** Atajo: evento cuyo payload es la foto de la sesión + datos extra. */
export async function recordSessionEvent(
  tx: Tx,
  type: TutoringEventType,
  sessionId: string,
  extra: Record<string, unknown> = {},
) {
  await recordEvent(tx, type, sessionId, { ...(await sessionSnapshot(tx, sessionId)), ...extra });
}
