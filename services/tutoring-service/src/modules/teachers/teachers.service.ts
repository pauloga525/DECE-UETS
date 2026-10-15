import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeacherDto, UpdateTeacherDto } from './dto/teacher.dto';

@Injectable()
export class TeachersService {
  private readonly log = new Logger(TeachersService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

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

  /**
   * Edición del docente (Admin). Si cambia el correo (pedido 2026-10-15), además:
   *   1. Su cuenta de acceso en identity se renombra al correo nuevo (o se habilita) — primero,
   *      para no dejar la ficha con un correo que no puede iniciar sesión.
   *   2. La ficha se desvincula de la cuenta anterior; el próximo login con el correo nuevo la vincula.
   *   3. Los cursos que anima pasan al correo nuevo.
   */
  async update(id: string, dto: UpdateTeacherDto) {
    const teacher = await this.findOne(id);
    const { email: rawEmail, ...rest } = dto;
    const email = rawEmail?.trim().toLowerCase();
    if (!email || email === teacher.email) {
      return this.prisma.teacher.update({ where: { id }, data: rest });
    }

    const taken = await this.prisma.teacher.findFirst({ where: { email, id: { not: id } } });
    if (taken) throw new ConflictException(`Ya existe otro docente con el correo ${email}.`);

    await this.syncIdentityEmail(teacher.email, email, `${rest.firstName ?? teacher.firstName} ${rest.lastName ?? teacher.lastName}`);

    return this.prisma.$transaction(async (tx) => {
      await tx.parallel.updateMany({ where: { animatorEmail: teacher.email }, data: { animatorEmail: email } });
      return tx.teacher.update({ where: { id }, data: { ...rest, email, userId: null } });
    });
  }

  private async syncIdentityEmail(oldEmail: string, newEmail: string, fullName: string) {
    const base = this.config.get<string>('IDENTITY_SERVICE_URL', 'http://localhost:4001').replace(/\/$/, '');
    let res: Response;
    try {
      res = await fetch(`${base}/api/internal/users/change-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-token': this.config.get<string>('INTERNAL_SERVICE_TOKEN', '') },
        body: JSON.stringify({ oldEmail, newEmail, fullName }),
      });
    } catch (e) {
      this.log.error(`identity-service no responde al cambiar el correo: ${e}`);
      throw new BadRequestException('No se pudo actualizar la cuenta de acceso del docente. Intenta de nuevo.');
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new BadRequestException(body?.message ?? 'El correo no es válido para una cuenta institucional.');
    }
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
