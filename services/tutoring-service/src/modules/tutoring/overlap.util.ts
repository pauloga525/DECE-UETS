import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { timeRangesOverlap } from '../../common/time.util';

export const ACTIVE_ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  EnrollmentStatus.ENROLLED,
  EnrollmentStatus.ATTENDED,
];

interface StudentRef {
  studentId: string;
}

interface SessionRef {
  id: string;
  date: Date;
  startTime: string;
  endTime: string;
}

// Regla 7, sección 4: un estudiante no puede estar inscrito en dos tutorías que se superpongan.
// Compartido entre el flujo de creación/inscripción y la reprogramación/lista de espera.
export async function assertNoStudentOverlap(
  tx: Prisma.TransactionClient,
  students: StudentRef[],
  session: SessionRef,
) {
  for (const student of students) {
    const conflicting = await tx.tutoringEnrollment.findMany({
      where: {
        studentId: student.studentId,
        status: { in: ACTIVE_ENROLLMENT_STATUSES },
        tutoringSessionId: { not: session.id },
        tutoringSession: { date: session.date },
      },
      include: { tutoringSession: true },
    });
    const overlaps = conflicting.some((enrollment) =>
      timeRangesOverlap(
        session.startTime,
        session.endTime,
        enrollment.tutoringSession.startTime,
        enrollment.tutoringSession.endTime,
      ),
    );
    if (overlaps) {
      throw new ConflictException('El estudiante ya tiene una tutoría en este horario.');
    }
  }
}

// Un estudiante solo puede inscribirse en tutorías de su propio NIVEL (la asignación del
// docente es por materia+nivel). Desde 2026-10-02 una tutoría puede reunir alumnos de
// distintos paralelos del mismo nivel: el paralelo es del alumno, no de la tutoría.
// Compartido entre agendar, sumar cupos y lista de espera (y su promoción).
//
// Desde la carga de docentes (2026-10-05) la asignación además lista los paralelos donde el
// docente dicta la materia: el alumno debe pertenecer a uno de ellos. Así un docente que es
// animador de otro curso no puede crear tutorías para esos alumnos (solo los ve en reportes).
export async function assertStudentBelongsToLevel(
  tx: Prisma.TransactionClient,
  studentId: string,
  levelId: string,
  teacherAssignmentId?: string,
) {
  const student = await tx.student.findUnique({ where: { id: studentId } });
  if (!student) throw new NotFoundException('Estudiante no encontrado');
  if (!student.isActive) throw new BadRequestException('El estudiante está inactivo.');
  if (student.levelId !== levelId) {
    throw new BadRequestException('El estudiante no pertenece al nivel de esta tutoría.');
  }
  if (teacherAssignmentId) {
    const parallels = await tx.teacherAssignmentParallel.findMany({
      where: { teacherAssignmentId },
      select: { parallelId: true },
    });
    if (parallels.length > 0 && !parallels.some((p) => p.parallelId === student.parallelId)) {
      throw new BadRequestException(
        'El estudiante no pertenece a un paralelo donde el docente dicta esta materia.',
      );
    }
  }
}

interface EnrollInput {
  tutoringSessionId: string;
  studentId: string;
  reason: Prisma.TutoringEnrollmentCreateInput['reason'];
  reasonNote?: string | null;
  createdById: string;
}

/**
 * Inscribe a un estudiante en una sesión. Si ya existía una inscripción CANCELLED para ese
 * mismo (sesión, estudiante) — la cancelación es no destructiva (regla 14), la fila nunca se
 * borra — la reactiva en vez de intentar un `create` que choca con el `@@unique` y revienta
 * con 500 (Unique constraint failed on (tutoringSessionId, studentId)).
 */
export function enrollStudent(tx: Prisma.TransactionClient, input: EnrollInput) {
  return tx.tutoringEnrollment.upsert({
    where: {
      tutoringSessionId_studentId: {
        tutoringSessionId: input.tutoringSessionId,
        studentId: input.studentId,
      },
    },
    create: {
      tutoringSessionId: input.tutoringSessionId,
      studentId: input.studentId,
      reason: input.reason,
      reasonNote: input.reasonNote,
      createdById: input.createdById,
    },
    update: {
      status: EnrollmentStatus.ENROLLED,
      reason: input.reason,
      reasonNote: input.reasonNote,
      createdById: input.createdById,
    },
  });
}
