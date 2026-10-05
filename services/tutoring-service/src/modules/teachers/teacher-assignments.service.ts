import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    const { parallelIds, ...data } = dto;
    if (parallelIds) await this.assertParallelsOfLevel(existing.levelId, parallelIds);

    // Pendiente #4 (sección 14): por ahora se permite desactivar con advertencia;
    // no se bloquea aunque existan tutorías futuras dependientes.
    return this.prisma.teacherAssignment.update({
      where: { id },
      data: {
        ...data,
        ...(parallelIds && {
          parallels: { deleteMany: {}, create: [...new Set(parallelIds)].map((parallelId) => ({ parallelId })) },
        }),
      },
      include: ASSIGNMENT_INCLUDE,
    });
  }
}
