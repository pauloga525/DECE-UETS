import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export interface AssignmentScope {
  assignmentId: string;
  levelId: string;
  /** Paralelos donde dicta la materia en ese nivel; vacío = todo el nivel. */
  parallelIds: string[];
}

/**
 * Asignaciones "hermanas" (pedido 2026-10-13): la misma materia, del mismo docente y período,
 * en niveles del mismo curso que solo cambian de especialidad (p. ej. Matemáticas de 3.º
 * Bachillerato IEME y de 3.º Bachillerato Mecanizado). Para el docente es una sola materia: un
 * mismo bloque de tutoría puede reunir alumnos de todas esas especialidades.
 *
 * Devuelve la propia asignación más sus hermanas, cada una con sus paralelos. Si el nivel no
 * tiene curso/nivel educativo registrados, solo la propia asignación.
 */
export async function assignmentScopes(db: Db, assignmentId: string): Promise<AssignmentScope[]> {
  const assignment = await db.teacherAssignment.findUnique({
    where: { id: assignmentId },
    include: { level: true, parallels: true },
  });
  if (!assignment) return [];
  const { grade, educationLevel } = assignment.level;
  const siblings =
    grade != null && educationLevel
      ? await db.teacherAssignment.findMany({
          where: {
            id: { not: assignment.id },
            teacherId: assignment.teacherId,
            subjectId: assignment.subjectId,
            academicPeriodId: assignment.academicPeriodId,
            isActive: true,
            level: { grade, educationLevel },
          },
          include: { parallels: true },
        })
      : [];
  return [assignment, ...siblings].map((a) => ({
    assignmentId: a.id,
    levelId: a.levelId,
    parallelIds: a.parallels.map((p) => p.parallelId),
  }));
}

/** Filtro Prisma de estudiantes dentro de esos alcances (nivel + paralelos de cada uno). */
export function studentsInScopes(scopes: AssignmentScope[]): Prisma.StudentWhereInput {
  return {
    OR: scopes.map((s) => ({ levelId: s.levelId, ...(s.parallelIds.length ? { parallelId: { in: s.parallelIds } } : {}) })),
  };
}

/**
 * Clave del bloque de tutoría dentro de un docente (TutoringSession.slotKey): materia + curso sin
 * la especialidad. Así las especialidades hermanas comparten un solo bloque, y materias técnicas
 * distintas a la misma hora tienen cada una el suyo (pedido 2026-10-23). Debe coincidir con el
 * cálculo de la migración 20261023120000_materias_tecnicas.
 */
export function slotKeyOf(subjectId: string, level: { id: string; grade: number | null; educationLevel: string | null }) {
  const course = level.grade != null && level.educationLevel ? `${level.educationLevel}#${level.grade}` : level.id;
  return `${subjectId}:${course}`;
}
