import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { LinkGuardianDto, UpdateGuardianDto } from './guardian.dto';

// Datos de contacto de familias: solo Admin y equipo de psicología.
const ROLES = [UserRole.ADMIN, UserRole.PSYCHOLOGY_COORDINATOR, UserRole.PSYCHOLOGIST];

/**
 * Representantes de los estudiantes (pedido 2026-09-30). Reciben los correos de las
 * tutorías de sus representados. Los datos reales llegarán por importación de Excel.
 */
@ApiTags('guardians')
@ApiBearerAuth()
@Roles(...ROLES)
@Controller()
export class GuardiansController {
  constructor(private prisma: PrismaService) {}

  @Get('students/:studentId/guardians')
  @ApiOperation({ summary: 'Representantes de un estudiante' })
  async list(@Param('studentId') studentId: string) {
    await this.assertStudent(studentId);
    return this.prisma.studentGuardian.findMany({
      where: { studentId },
      include: { guardian: true },
      orderBy: { guardian: { lastName: 'asc' } },
    });
  }

  @Post('students/:studentId/guardians')
  @ApiOperation({
    summary: 'Agregar un representante a un estudiante',
    description: 'Si ya existe un representante con esa cédula, se vincula el existente (hermanos comparten representante).',
  })
  async link(@Param('studentId') studentId: string, @Body() dto: LinkGuardianDto) {
    await this.assertStudent(studentId);
    const { relationship, notifications, ...data } = dto;
    const guardian = dto.identification
      ? await this.prisma.guardian.upsert({
          where: { identification: dto.identification },
          update: { ...data, email: data.email ?? undefined },
          create: data,
        })
      : await this.prisma.guardian.create({ data });
    try {
      return await this.prisma.studentGuardian.create({
        data: { studentId, guardianId: guardian.id, relationship, notifications: notifications ?? true },
        include: { guardian: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ese representante ya está vinculado a este estudiante');
      }
      throw e;
    }
  }

  @Patch('guardians/:id')
  @ApiOperation({ summary: 'Editar datos de contacto de un representante' })
  async update(@Param('id') id: string, @Body() dto: UpdateGuardianDto) {
    if (!(await this.prisma.guardian.findUnique({ where: { id } }))) {
      throw new NotFoundException('Representante no encontrado');
    }
    return this.prisma.guardian.update({ where: { id }, data: dto });
  }

  @Patch('students/:studentId/guardians/:guardianId')
  @ApiOperation({ summary: 'Cambiar parentesco o si recibe notificaciones' })
  updateLink(
    @Param('studentId') studentId: string,
    @Param('guardianId') guardianId: string,
    @Body() dto: Pick<LinkGuardianDto, 'relationship' | 'notifications'>,
  ) {
    return this.prisma.studentGuardian.update({
      where: { studentId_guardianId: { studentId, guardianId } },
      data: { relationship: dto.relationship, notifications: dto.notifications },
      include: { guardian: true },
    });
  }

  @Delete('students/:studentId/guardians/:guardianId')
  @ApiOperation({ summary: 'Desvincular un representante del estudiante' })
  async unlink(@Param('studentId') studentId: string, @Param('guardianId') guardianId: string) {
    await this.prisma.studentGuardian.delete({
      where: { studentId_guardianId: { studentId, guardianId } },
    });
    return { success: true };
  }

  private async assertStudent(id: string) {
    if (!(await this.prisma.student.findUnique({ where: { id } }))) {
      throw new NotFoundException('Estudiante no encontrado');
    }
  }
}
