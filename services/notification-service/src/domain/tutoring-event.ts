/**
 * Contrato de los eventos que publica tutoring-service (ver
 * services/tutoring-service/src/modules/events/domain-events.ts). El notification-service
 * no consulta la base de tutorías: toda la información viaja en el evento.
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

export interface GuardianInfo {
  name: string;
  email: string;
  relationship: string | null;
}

export interface StudentInfo {
  id: string;
  enrollmentId: string;
  name: string;
  /** Paralelo del alumno (una tutoría puede mezclar paralelos del nivel). */
  parallel?: string;
  enrollmentStatus: 'ENROLLED' | 'ATTENDED' | 'ABSENT' | 'JUSTIFIED' | 'CANCELLED';
  attendance: 'PRESENT' | 'ABSENT' | 'JUSTIFIED' | null;
  guardians: GuardianInfo[];
}

export interface SessionSnapshot {
  session: {
    id: string;
    status: string;
    date: string; // YYYY-MM-DD
    startTime: string;
    endTime: string;
    startsAt: string; // ISO UTC
    endsAt: string;
    location: string | null;
    subject: string;
    level: string;
    parallel: string | null;
    autoCompleted: boolean;
    startedAt: string | null;
    cancelReason: string | null;
  };
  teacher: { id: string; name: string; email: string };
  students: StudentInfo[];
  report: { skills: string; observations: string; tasks: string | null } | null;
}

export interface TutoringEvent {
  id: string;
  type: TutoringEventType;
  aggregateId: string;
  occurredAt: string;
  payload: SessionSnapshot & {
    studentIds?: string[];
    notStarted?: boolean;
    autoAbsentStudentIds?: string[];
    previous?: { sessionId: string; date: string; startTime: string; endTime: string };
  };
}

/** Persona del DECE que recibe avisos (correo + campana del sistema). */
export interface DeceMember {
  id: string;
  email: string;
  fullName: string | null;
}
