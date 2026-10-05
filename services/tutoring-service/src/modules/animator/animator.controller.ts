import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EnrollmentStatus, SessionStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { findAnimatorParallels, resolveAnimatorParallel } from './animator-scope';

/**
 * Vista del animador de curso (pedido 2026-09-30): sus alumnos, sus tutorías (pendientes,
 * asistencias, faltas) y el historial de cada uno. Nunca ve otros cursos. Solo lectura: las
 * tutorías se crean desde la asignación de materia, no como animador (pedido 2026-10-05).
 * Ser animador lo da el curso asignado (Parallel.animatorEmail), no el rol: docentes y personal
 * del DECE también animan cursos. Si no tiene curso, la lista
 * de cursos viene vacía y el resto responde 403.
 */
@ApiTags('animator')
@ApiBearerAuth()
@Roles(
  UserRole.ANIMATOR,
  UserRole.TEACHER,
  UserRole.PSYCHOLOGIST,
  UserRole.PSYCHOLOGY_COORDINATOR,
  UserRole.ADMIN,
)
@Controller('animator')
export class AnimatorController {
  constructor(private prisma: PrismaService) {}

  @Get('courses')
  @ApiOperation({ summary: 'Mis cursos como animador (nivel + paralelo)' })
  courses(@CurrentUser() user: AuthenticatedUser) {
    return findAnimatorParallels(this.prisma, user);
  }

  @Get('students')
  @ApiOperation({ summary: 'Todos los alumnos de mi curso con su resumen de tutorías (asistencia, faltas, pendientes)' })
  async students(@CurrentUser() user: AuthenticatedUser, @Query('parallelId') parallelId?: string) {
    const scope = await resolveAnimatorParallel(this.prisma, user, parallelId);
    const students = await this.prisma.student.findMany({
      where: { parallelId: scope, isActive: true },
      include: {
        enrollments: {
          where: { status: { not: EnrollmentStatus.CANCELLED } },
          include: {
            tutoringSession: { select: { date: true, status: true, subject: { select: { name: true } } } },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return {
      parallelId: scope,
      students: students.map(({ enrollments, ...s }) => ({
        ...s,
        total: enrollments.length,
        attended: enrollments.filter((e) => e.status === EnrollmentStatus.ATTENDED).length,
        absent: enrollments.filter((e) => e.status === EnrollmentStatus.ABSENT).length,
        justified: enrollments.filter((e) => e.status === EnrollmentStatus.JUSTIFIED).length,
        // Pendiente = agendada y todavía no realizada (o en curso).
        pending: enrollments.filter(
          (e) =>
            e.status === EnrollmentStatus.ENROLLED &&
            (e.tutoringSession.status === SessionStatus.SCHEDULED || e.tutoringSession.status === SessionStatus.IN_PROGRESS),
        ).length,
        subjects: [...new Set(enrollments.map((e) => e.tutoringSession.subject.name))],
        lastDate: enrollments.map((e) => e.tutoringSession.date).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
      })),
    };
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Tutorías pendientes (agendadas o en curso) de los alumnos de mi curso' })
  async upcoming(@CurrentUser() user: AuthenticatedUser, @Query('parallelId') parallelId?: string) {
    const scope = await resolveAnimatorParallel(this.prisma, user, parallelId);
    return this.prisma.tutoringEnrollment.findMany({
      where: {
        status: EnrollmentStatus.ENROLLED,
        student: { parallelId: scope },
        tutoringSession: { status: { in: [SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS] } },
      },
      select: {
        id: true,
        student: { select: { id: true, firstName: true, lastName: true, identification: true } },
        tutoringSession: {
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            status: true,
            location: true,
            subject: { select: { name: true } },
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ tutoringSession: { date: 'asc' } }, { tutoringSession: { startTime: 'asc' } }],
    });
  }

  @Get('students/:id/history')
  @ApiOperation({ summary: 'Historial de tutorías de un alumno de mi curso' })
  async history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    const student = await this.prisma.student.findUnique({ where: { id }, include: { level: true, parallel: true } });
    if (!student) throw new NotFoundException('Estudiante no encontrado');
    await resolveAnimatorParallel(this.prisma, user, student.parallelId);
    const history = await this.prisma.tutoringEnrollment.findMany({
      where: { studentId: id },
      include: {
        attendance: true,
        tutoringSession: {
          include: { teacher: true, subject: true, level: true, parallel: true, report: true },
        },
      },
      orderBy: { tutoringSession: { date: 'desc' } },
    });
    return { student, history };
  }
}
