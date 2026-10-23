import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DayOfWeek, SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { assertActsOnOwnTeacher } from '../teachers/teacher-of-user';
import { assignmentScopes } from '../teachers/assignment-scope';
import { isMultipleOfBlock, splitIntoBlocks, timeRangesOverlap } from '../../common/time.util';
import { CreateAvailabilityRuleDto, UpdateAvailabilityRuleDto } from './dto/availability-rule.dto';

/** Dos horarios comparten bloques solo si sus inicios están separados por múltiplos de 40 min. */
function blocksAligned(a: string, b: string) {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return Math.abs(toMin(a) - toMin(b)) % 40 === 0;
}

@Injectable()
export class AvailabilityRulesService {
  constructor(private prisma: PrismaService) {}

  // El horario cuelga de una TeacherAssignment concreta (materia+nivel) — pedido explícito de
  // Paulo: el docente declara un horario de tutoría por cada combinación que enseña, y el DECE
  // ya no elige materia/nivel al agendar (sección 6 del plan queda así reducida a 5 pasos).
  // El docente sube SU horario (pedido 7/9/2026): solo sobre sus propias asignaciones.
  async create(dto: CreateAvailabilityRuleDto, actor: AuthenticatedUser) {
    if (!isMultipleOfBlock(dto.startTime, dto.endTime)) {
      throw new BadRequestException('El horario debe ser múltiplo de 40 minutos');
    }

    const assignment = await this.prisma.teacherAssignment.findUnique({
      where: { id: dto.teacherAssignmentId },
    });
    if (!assignment || !assignment.isActive) {
      throw new BadRequestException('La asignación materia+nivel no existe o no está vigente');
    }
    await assertActsOnOwnTeacher(this.prisma, actor, assignment.teacherId);

    await this.assertNoTeacherOverlap(assignment.id, dto.dayOfWeek, dto.startTime, dto.endTime);

    return this.prisma.teacherAvailabilityRule.create({
      data: { ...dto, location: dto.location.trim() },
      include: { teacherAssignment: { include: { teacher: true, subject: true, level: true } } },
    });
  }

  /**
   * Aunque las reglas cuelgan de asignaciones distintas, son del mismo docente físico: no puede
   * declarar Matemáticas martes 8-9 y Lengua martes 8-9 a la vez. Excepciones:
   *  - la misma materia en otra especialidad del mismo curso (pedido 2026-10-13) comparte
   *    horario: el bloque es uno solo y admite alumnos de todas; los bloques deben coincidir;
   *  - materias técnicas (pedido 2026-10-23): el docente atiende a la vez varias materias
   *    técnicas de distintos niveles y especialidades; cada una tiene su propio bloque.
   */
  private async assertNoTeacherOverlap(
    assignmentId: string,
    dayOfWeek: DayOfWeek,
    startTime: string,
    endTime: string,
    excludeRuleId?: string,
  ) {
    const assignment = await this.prisma.teacherAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: { subject: true },
    });
    const sameDayRules = await this.prisma.teacherAvailabilityRule.findMany({
      where: {
        id: excludeRuleId ? { not: excludeRuleId } : undefined,
        dayOfWeek,
        isActive: true,
        teacherAssignment: { teacherId: assignment.teacherId, isActive: true },
      },
      include: { teacherAssignment: { include: { subject: true, level: true } } },
    });
    const siblingIds = new Set((await assignmentScopes(this.prisma, assignment.id)).map((s) => s.assignmentId));
    const conflict = sameDayRules.find((r) => {
      if (!timeRangesOverlap(startTime, endTime, r.startTime, r.endTime)) return false;
      if (siblingIds.has(r.teacherAssignmentId)) return !blocksAligned(startTime, r.startTime);
      return !(assignment.subject.isTechnical && r.teacherAssignment.subject.isTechnical);
    });
    if (conflict) {
      const other = `${conflict.teacherAssignment.subject.name} · ${conflict.teacherAssignment.level.name} (${conflict.startTime}–${conflict.endTime})`;
      throw new BadRequestException(
        `Este horario se cruza con otro ya declarado: ${other}. Solo pueden cruzarse las materias técnicas entre sí, o la misma materia del mismo curso en otra especialidad (con los bloques alineados).`,
      );
    }
  }

  findAll(filters: {
    teacherId?: string;
    academicPeriodId?: string;
    teacherAssignmentId?: string;
  }) {
    return this.prisma.teacherAvailabilityRule.findMany({
      where: {
        teacherAssignmentId: filters.teacherAssignmentId,
        teacherAssignment: {
          teacherId: filters.teacherId,
          academicPeriodId: filters.academicPeriodId,
        },
      },
      include: { teacherAssignment: { include: { teacher: true, subject: true, level: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async update(id: string, dto: UpdateAvailabilityRuleDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.teacherAvailabilityRule.findUnique({
      where: { id },
      include: { teacherAssignment: true },
    });
    if (!existing) throw new NotFoundException('Regla de disponibilidad no encontrada');
    await assertActsOnOwnTeacher(this.prisma, actor, existing.teacherAssignment.teacherId);
    // Reactivar un horario vuelve a validar los cruces: mientras estuvo inactivo pudo
    // declararse otro en ese rango.
    if (dto.isActive && !existing.isActive) {
      await this.assertNoTeacherOverlap(existing.teacherAssignmentId, existing.dayOfWeek, existing.startTime, existing.endTime, id);
    }
    const location = dto.location?.trim();
    const rule = await this.prisma.teacherAvailabilityRule.update({
      where: { id },
      data: { isActive: dto.isActive, location },
    });
    // Los bloques todavía libres de hoy en adelante adoptan el nuevo lugar; las tutorías ya
    // agendadas conservan el suyo (ya se avisó a las familias).
    if (location) {
      const today = new Date(new Date().toISOString().slice(0, 10));
      await this.prisma.tutoringSession.updateMany({
        where: { availabilityRuleId: id, status: SessionStatus.AVAILABLE, date: { gte: today } },
        data: { location },
      });
    }
    return rule;
  }

  /**
   * Eliminar un horario (pedido 2026-10-23: el docente puede borrarlo, no solo desactivarlo).
   * Se borran sus bloques libres desde hoy (sin alumnos ni lista de espera). Si tiene tutorías
   * agendadas o en curso a futuro no se borra: primero hay que cancelarlas (las familias ya
   * fueron avisadas). Las tutorías pasadas se conservan como historial, sin horario de origen.
   */
  async remove(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.teacherAvailabilityRule.findUnique({
      where: { id },
      include: { teacherAssignment: true },
    });
    if (!existing) throw new NotFoundException('Horario no encontrado');
    await assertActsOnOwnTeacher(this.prisma, actor, existing.teacherAssignment.teacherId);

    const today = new Date(new Date().toISOString().slice(0, 10));
    const pending = await this.prisma.tutoringSession.count({
      where: {
        availabilityRuleId: id,
        date: { gte: today },
        status: { in: [SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS] },
      },
    });
    if (pending > 0) {
      throw new ConflictException(
        `Este horario tiene ${pending} tutoría(s) agendada(s). Cancélalas primero o desactiva el horario.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const freed = await tx.tutoringSession.deleteMany({
        where: {
          availabilityRuleId: id,
          status: SessionStatus.AVAILABLE,
          date: { gte: today },
          enrollments: { none: {} },
          waitlist: { none: {} },
        },
      });
      await tx.teacherAvailabilityRule.delete({ where: { id } });
      return { deleted: true, freedBlocks: freed.count };
    });
  }

  /** Vista previa de la división en bloques de 40 min — usada por la pantalla 09 sin persistir nada. */
  preview(startTime: string, endTime: string) {
    if (!isMultipleOfBlock(startTime, endTime)) {
      throw new BadRequestException('El horario debe ser múltiplo de 40 minutos');
    }
    return splitIntoBlocks(startTime, endTime);
  }
}
