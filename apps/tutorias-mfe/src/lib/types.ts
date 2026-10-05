// Espeja los enums y formas de datos del backend (backend/prisma/schema.prisma).

export type UserRole = 'ADMIN' | 'PSYCHOLOGY_COORDINATOR' | 'PSYCHOLOGIST' | 'TEACHER' | 'ANIMATOR' | 'STUDENT';

export type SessionStatus = 'AVAILABLE' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type EnrollmentStatus = 'ENROLLED' | 'ATTENDED' | 'ABSENT' | 'JUSTIFIED' | 'CANCELLED';

export type EnrollmentReason =
  | 'ACADEMIC_REINFORCEMENT'
  | 'LOW_PERFORMANCE'
  | 'LEVELING'
  | 'RECOVERY'
  | 'TEACHER_REQUEST'
  | 'STUDENT_REQUEST'
  | 'REPRESENTATIVE_REQUEST'
  | 'OTHER';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'JUSTIFIED';

export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export const ENROLLMENT_REASON_LABEL: Record<EnrollmentReason, string> = {
  ACADEMIC_REINFORCEMENT: 'Refuerzo académico',
  LOW_PERFORMANCE: 'Bajo rendimiento',
  LEVELING: 'Nivelación',
  RECOVERY: 'Recuperación',
  TEACHER_REQUEST: 'Solicitud del docente',
  STUDENT_REQUEST: 'Solicitud del estudiante',
  REPRESENTATIVE_REQUEST: 'Solicitud del representante',
  OTHER: 'Otro',
};

export const DAY_OF_WEEK_LABEL: Record<DayOfWeek, string> = {
  MONDAY: 'Lunes',
  TUESDAY: 'Martes',
  WEDNESDAY: 'Miércoles',
  THURSDAY: 'Jueves',
  FRIDAY: 'Viernes',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
};

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  PSYCHOLOGY_COORDINATOR: 'Coordinador de psicólogos',
  PSYCHOLOGIST: 'Psicólogo(a)',
  TEACHER: 'Docente',
  ANIMATOR: 'Animador de curso',
  STUDENT: 'Estudiante',
};

export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  AVAILABLE: 'Disponible',
  SCHEDULED: 'Programada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export interface AcademicPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface Level {
  id: string;
  name: string;
  order: number;
  academicPeriodId: string;
  isActive: boolean;
  parallels?: Parallel[];
}

export interface Parallel {
  id: string;
  name: string;
  levelId: string;
  isActive: boolean;
  animatorEmail?: string | null;
  level?: Level;
}

export interface Guardian {
  id: string;
  firstName: string;
  lastName: string;
  identification?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface StudentGuardianLink {
  studentId: string;
  guardianId: string;
  relationship?: string | null;
  notifications: boolean;
  guardian: Guardian;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  isActive: boolean;
}

export interface TeacherAssignment {
  id: string;
  teacherId: string;
  subjectId: string;
  levelId: string;
  academicPeriodId: string;
  isActive: boolean;
  subject?: Subject;
  level?: Level;
  teacher?: Teacher;
  academicPeriod?: AcademicPeriod;
  /** Paralelos donde dicta la materia; vacío = todo el nivel. */
  parallels?: { parallelId: string; parallel?: Parallel }[];
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  identification: string;
  levelId: string;
  parallelId: string;
  isActive: boolean;
  level?: Level;
  parallel?: Parallel;
}

export interface TutoringEnrollment {
  id: string;
  tutoringSessionId: string;
  studentId: string;
  reason: EnrollmentReason;
  reasonNote?: string | null;
  status: EnrollmentStatus;
  student?: Student;
  attendance?: { status: AttendanceStatus; note?: string | null } | null;
  tutoringSession?: TutoringSession;
}

export interface WaitlistEntry {
  id: string;
  tutoringSessionId: string;
  studentId: string;
  position: number;
  status: 'WAITING' | 'PROMOTED' | 'CANCELLED';
  student?: Student;
}

export interface TutoringSession {
  id: string;
  teacherId: string;
  // Ya no son null en ningún estado: se heredan de la TeacherAssignment de la regla que
  // generó el bloque desde el momento en que se crea (aunque siga AVAILABLE).
  subjectId: string;
  levelId: string;
  teacherAssignmentId: string;
  parallelId: string | null; // se define recién al agendar (SCHEDULED)
  academicPeriodId: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  status: SessionStatus;
  cancelReason?: string | null;
  location?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  autoCompleted?: boolean;
  report?: TutoringReport | null;
  /** Instantes absolutos calculados por el servidor (solo en el detalle). */
  timing?: { startsAt: string; endsAt: string; serverNow: string };
  teacher?: Teacher;
  subject?: Subject;
  level?: Level;
  parallel?: Parallel | null;
  enrollments?: TutoringEnrollment[];
  waitlist?: WaitlistEntry[];
}

export interface TutoringReport {
  id: string;
  skills: string;
  observations: string;
  tasks?: string | null;
  submittedAt: string;
}

export interface AvailabilityRule {
  id: string;
  teacherAssignmentId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  isActive: boolean;
  /** Lugar donde el docente da estas tutorías; se copia a cada bloque generado. */
  location?: string | null;
  teacherAssignment?: TeacherAssignment;
}

export interface ReportSummary {
  totalSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  studentsAttended: number;
  absences: number;
  justified: number;
  topSubject: { name: string; count: number } | null;
}

export interface ReportBucket {
  name: string;
  count: number;
}

export interface ReportMonthBucket {
  month: string;
  label: string;
  count: number;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  createdAt: string;
  user: { id: string; email: string; role: UserRole };
}
