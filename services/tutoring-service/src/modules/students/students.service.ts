import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assignmentScopes, studentsInScopes } from '../teachers/assignment-scope';
import { CreateStudentDto, UpdateStudentDto } from './dto/student.dto';

@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateStudentDto) {
    try {
      return await this.prisma.student.create({
        data: dto,
        include: { level: true, parallel: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un estudiante con esa identificación');
      }
      throw e;
    }
  }

  /**
   * assignmentId: solo los alumnos que esa asignación puede atender (su nivel y, si la
   * asignación tiene paralelos, solo esos) — es lo que ofrece el selector al crear la tutoría.
   */
  async findAll(filters: { levelId?: string; parallelId?: string; search?: string; assignmentId?: string }) {
    let scope: Prisma.StudentWhereInput = { levelId: filters.levelId };
    if (filters.assignmentId) {
      // Incluye las especialidades hermanas del mismo curso con la misma materia.
      const scopes = await assignmentScopes(this.prisma, filters.assignmentId);
      if (!scopes.length) throw new NotFoundException('Asignación no encontrada');
      scope = studentsInScopes(scopes);
    }
    return this.prisma.student.findMany({
      where: {
        AND: [
          scope,
          filters.parallelId ? { parallelId: filters.parallelId } : {},
          filters.search
            ? {
                OR: [
                  { firstName: { contains: filters.search, mode: 'insensitive' } },
                  { lastName: { contains: filters.search, mode: 'insensitive' } },
                  { identification: { contains: filters.search, mode: 'insensitive' } },
                ],
              }
            : {},
        ],
      },
      include: { level: true, parallel: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findOne(id: string) {
    const student = await this.prisma.student.findUnique({
      where: { id },
      include: { level: true, parallel: true },
    });
    if (!student) throw new NotFoundException('Estudiante no encontrado');
    return student;
  }

  async update(id: string, dto: UpdateStudentDto) {
    await this.findOne(id);
    return this.prisma.student.update({ where: { id }, data: dto });
  }

  /**
   * Borrado real (no el soft-delete de `isActive`) — solo posible si el estudiante no tiene
   * inscripciones ni entradas en lista de espera (`onDelete: Restrict` en el schema). Si tiene
   * historial, se rechaza con un mensaje claro en vez del 500 crudo de Prisma.
   */
  async remove(id: string) {
    await this.findOne(id);
    try {
      await this.prisma.student.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException(
          'No se puede eliminar: el estudiante tiene inscripciones o lista de espera asociadas. Desactívalo en su lugar.',
        );
      }
      throw e;
    }
  }

  /** Pantalla 16: timeline cronológico de tutorías del estudiante, con asistencia. */
  async history(id: string) {
    await this.findOne(id);
    return this.prisma.tutoringEnrollment.findMany({
      where: { studentId: id },
      include: {
        attendance: true,
        tutoringSession: { include: { teacher: true, subject: true, level: true, parallel: true } },
      },
      orderBy: { tutoringSession: { date: 'desc' } },
    });
  }
}
