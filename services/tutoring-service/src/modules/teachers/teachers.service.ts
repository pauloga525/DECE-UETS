import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeacherDto, UpdateTeacherDto } from './dto/teacher.dto';

@Injectable()
export class TeachersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTeacherDto) {
    try {
      return await this.prisma.teacher.create({ data: dto });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un docente con ese correo');
      }
      throw e;
    }
  }

  findAll() {
    return this.prisma.teacher.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findOne(id: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            subject: true,
            level: true,
            academicPeriod: true,
            availabilityRules: true,
            parallels: { include: { parallel: true }, orderBy: { parallel: { name: 'asc' } } },
          },
        },
      },
    });
    if (!teacher) throw new NotFoundException('Docente no encontrado');
    return teacher;
  }

  async update(id: string, dto: UpdateTeacherDto) {
    await this.findOne(id);
    return this.prisma.teacher.update({ where: { id }, data: dto });
  }

  /**
   * Borrado real (no el soft-delete de `isActive`) — solo posible si el docente no tiene
   * asignaciones, disponibilidad ni tutorías asociadas (`onDelete: Restrict` en el schema).
   * Si tiene historial, se rechaza con un mensaje claro en vez del 500 crudo de Prisma.
   */
  async remove(id: string) {
    await this.findOne(id);
    try {
      await this.prisma.teacher.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException(
          'No se puede eliminar: el docente tiene asignaciones o tutorías asociadas. Desactívalo en su lugar.',
        );
      }
      throw e;
    }
  }
}
