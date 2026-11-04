import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateTeacherAssignmentDto,
  UpdateTeacherAssignmentDto,
} from './dto/teacher-assignment.dto';

export const ASSIGNMENT_INCLUDE = {
  teacher: true,
  subject: true,
  level: true,
  academicPeriod: true,
  parallels: { include: { parallel: true }, orderBy: { parallel: { name: 'asc' } } },
} satisfies Prisma.TeacherAssignmentInclude;

@Injectable()
export class TeacherAssignmentsService {
  constructor(private prisma: PrismaService) {}

  /** Los paralelos deben ser del nivel de la asignación. */
  private async assertParallelsOfLevel(levelId: string, parallelIds: string[]) {
    if (!parallelIds.length) return;
    const count = await this.prisma.parallel.count({ where: { id: { in: parallelIds }, levelId } });
    if (count !== new Set(parallelIds).size) {
      throw new BadRequestException('Algún paralelo no pertenece al nivel de la asignación.');
    }
  }

  // Regla 5, sección 4: única combinación docente+materia+nivel+período.
  async create(dto: CreateTeacherAssignmentDto) {
    const { parallelIds = [], ...data } = dto;
    await this.assertParallelsOfLevel(dto.levelId, parallelIds);
    try {
      return await this.prisma.teacherAssignment.create({
        data: { ...data, parallels: { create: [...new Set(parallelIds)].map((parallelId) => ({ parallelId })) } },
        include: ASSIGNMENT_INCLUDE,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Esta combinación ya existe para este docente y período');
      }
      throw e;
    }
  }

  findAll(filters: { teacherId?: string; academicPeriodId?: string }) {
    return this.prisma.teacherAssignment.findMany({
      where: {
        teacherId: filters.teacherId,
        academicPeriodId: filters.academicPeriodId,
      },
      include: ASSIGNMENT_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateTeacherAssignmentDto) {
    const existing = await this.prisma.teacherAssignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Asignación no encontrada');
    const { parallelIds, teacherId, subjectId, levelId, ...data } = dto;

    // Reasignar docente, materia o curso (pedido 2026-11-04): es otra asignación con el mismo id.
    // Solo sin historial de tutorías; los horarios y bloques libres eran del docente/materia/curso
    // anterior, así que se borran.
    const target = {
      teacherId: teacherId ?? existing.teacherId,
      subjectId: subjectId ?? existing.subjectId,
      levelId: levelId ?? existing.levelId,
    };
    const reassigns =
      target.teacherId !== existing.teacherId ||
      target.subjectId !== existing.subjectId ||
      target.levelId !== existing.levelId;
    if (reassigns) {
      const used = await this.countHistory(id);
      if (used > 0) {
        throw new ConflictException(
          `Esta asignación ya tiene ${used} tutoría(s) registrada(s): no se puede cambiar de docente, materia o curso sin perder el historial. Quítale los paralelos o desactívala y crea una asignación nueva.`,
        );
      }
    }
    // Al cambiar de curso los paralelos anteriores ya no sirven: hay que indicar los nuevos.
    const finalParallels = parallelIds ?? (target.levelId !== existing.levelId ? [] : undefined);
    if (finalParallels) await this.assertParallelsOfLevel(target.levelId, finalParallels);

    // Pendiente #4 (sección 14): por ahora se permite desactivar con advertencia;
    // no se bloquea aunque existan tutorías futuras dependientes.
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (reassigns) {
          await tx.tutoringSession.deleteMany({ where: { teacherAssignmentId: id } });
          await tx.teacherAvailabilityRule.deleteMany({ where: { teacherAssignmentId: id } });
        }
        return tx.teacherAssignment.update({
          where: { id },
          data: {
            ...data,
            ...(reassigns && target),
            ...(finalParallels && {
              parallels: {
                deleteMany: {},
                create: [...new Set(finalParallels)].map((parallelId) => ({ parallelId })),
              },
            }),
          },
          include: ASSIGNMENT_INCLUDE,
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(
          'Ese docente ya tiene esa materia en ese curso para el período: edita esa asignación y agrégale los paralelos.',
        );
      }
      throw e;
    }
  }

  /** Tutorías con historial (agendadas, dictadas, canceladas, con alumnos o con informe). */
  private countHistory(assignmentId: string) {
    return this.prisma.tutoringSession.count({
      where: {
        teacherAssignmentId: assignmentId,
        OR: [
          { status: { not: SessionStatus.AVAILABLE } },
          { enrollments: { some: {} } },
          { report: { isNot: null } },
        ],
      },
    });
  }

  /**
   * Quitar una materia a un docente (Admin, pedido 2026-10-23). Solo si no tiene tutorías con
   * historial (agendadas, dictadas, canceladas o con alumnos): esas se conservan y la asignación
   * se desactiva en su lugar. Se borran sus horarios y los bloques libres.
   */
  async remove(id: string) {
    const existing = await this.prisma.teacherAssignment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Asignación no encontrada');
    const used = await this.countHistory(id);
    if (used > 0) {
      throw new ConflictException(
        `Esta materia ya tiene ${used} tutoría(s) registrada(s) y no se puede eliminar sin perder el historial. Desactívala en su lugar.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.tutoringSession.deleteMany({ where: { teacherAssignmentId: id } });
      await tx.teacherAvailabilityRule.deleteMany({ where: { teacherAssignmentId: id } });
      await tx.teacherAssignment.delete({ where: { id } });
      return { deleted: true };
    });
  }
}
