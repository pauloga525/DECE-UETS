import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { assertActsOnOwnTeacher } from '../teachers/teacher-of-user';
import { isMultipleOfBlock, splitIntoBlocks, timeRangesOverlap } from '../../common/time.util';
import { CreateAvailabilityRuleDto, UpdateAvailabilityRuleDto } from './dto/availability-rule.dto';

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

    // Aunque las reglas cuelgan de asignaciones distintas, son del mismo docente físico:
    // no puede declarar Matemáticas martes 8-9 y Lengua martes 8-9 a la vez.
    const sameDayRules = await this.prisma.teacherAvailabilityRule.findMany({
      where: {
        dayOfWeek: dto.dayOfWeek,
        isActive: true,
        teacherAssignment: { teacherId: assignment.teacherId },
      },
    });
    const overlaps = sameDayRules.some((r) =>
      timeRangesOverlap(dto.startTime, dto.endTime, r.startTime, r.endTime),
    );
    if (overlaps) {
      throw new BadRequestException(
        'Este docente ya tiene otro horario declarado que se cruza con este rango',
      );
    }

    return this.prisma.teacherAvailabilityRule.create({
      data: { ...dto, location: dto.location.trim() },
      include: { teacherAssignment: { include: { teacher: true, subject: true, level: true } } },
    });
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

  /** Vista previa de la división en bloques de 40 min — usada por la pantalla 09 sin persistir nada. */
  preview(startTime: string, endTime: string) {
    if (!isMultipleOfBlock(startTime, endTime)) {
      throw new BadRequestException('El horario debe ser múltiplo de 40 minutos');
    }
    return splitIntoBlocks(startTime, endTime);
  }
}
