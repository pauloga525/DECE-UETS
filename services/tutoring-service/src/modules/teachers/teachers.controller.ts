import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EnrollmentStatus, SessionStatus, UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { findTeacherOfUser } from './teacher-of-user';
import { TeachersService } from './teachers.service';
import { TeacherAssignmentsService } from './teacher-assignments.service';
import { CreateTeacherDto, UpdateTeacherDto } from './dto/teacher.dto';
import {
  CreateTeacherAssignmentDto,
  UpdateTeacherAssignmentDto,
} from './dto/teacher-assignment.dto';

// Gestión de docentes: solo Admin/DECE. Un docente no puede ver el listado ni los perfiles
// de otros docentes (ni el suyo propio por esta vía) — pedido explícito, no solo ocultar la UI.
const READ_ROLES = [UserRole.ADMIN, UserRole.PSYCHOLOGY_COORDINATOR, UserRole.PSYCHOLOGIST];
const WRITE_ROLES = [UserRole.ADMIN];

@ApiTags('teachers')
@ApiBearerAuth()
@Controller('teachers')
export class TeachersController {
  constructor(
    private teachers: TeachersService,
    private assignments: TeacherAssignmentsService,
    private prisma: PrismaService,
  ) {}

  @Roles(...WRITE_ROLES)
  @Post()
  @ApiOperation({ summary: 'Crear un docente (Admin)' })
  create(@Body() dto: CreateTeacherDto) {
    return this.teachers.create(dto);
  }

  @Roles(...READ_ROLES)
  @Get()
  @ApiOperation({ summary: 'Listar docentes' })
  findAll() {
    return this.teachers.findAll();
  }

  // El docente ve SOLO su propia ficha (asignaciones + horario) — la necesita para subir su
  // horario de tutorías y crear tutorías para sí mismo (pedidos 7/9/2026). Va antes de ':id'.
  @Roles(UserRole.TEACHER)
  @Get('me')
  @ApiOperation({ summary: 'Mi ficha de docente, con asignaciones y horario (Docente)' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    const teacher = await findTeacherOfUser(this.prisma, user);
    if (!teacher) {
      throw new NotFoundException(
        'Tu cuenta no está vinculada a una ficha de docente. Pide al DECE que registre tu correo como docente.',
      );
    }
    return this.teachers.findOne(teacher.id);
  }

  // "Mis alumnos" del docente (pedido 2026-10-05): los alumnos de los paralelos donde dicta
  // cada materia, con sus tutorías CON ESTE DOCENTE. Filtrable por asignación y paralelo.
  @Roles(UserRole.TEACHER)
  @Get('me/students')
  @ApiOperation({ summary: 'Mis alumnos por materia/nivel/paralelo, con sus tutorías conmigo (Docente)' })
  async myStudents(
    @CurrentUser() user: AuthenticatedUser,
    @Query('assignmentId') assignmentId?: string,
    @Query('parallelId') parallelId?: string,
  ) {
    const teacher = await findTeacherOfUser(this.prisma, user);
    if (!teacher) throw new NotFoundException('Tu cuenta no está vinculada a una ficha de docente.');
    const assignments = await this.prisma.teacherAssignment.findMany({
      where: { teacherId: teacher.id, isActive: true, ...(assignmentId && { id: assignmentId }) },
      include: { subject: true, level: true, parallels: { include: { parallel: true } } },
    });
    const rows = [];
    for (const a of assignments) {
      const parallelIds = a.parallels.map((p) => p.parallelId);
      const students = await this.prisma.student.findMany({
        where: {
          levelId: a.levelId,
          isActive: true,
          parallelId: parallelId ?? (parallelIds.length ? { in: parallelIds } : undefined),
        },
        include: {
          parallel: true,
          enrollments: {
            where: { status: { not: EnrollmentStatus.CANCELLED }, tutoringSession: { teacherAssignmentId: a.id } },
            include: { tutoringSession: { select: { status: true } } },
          },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
      for (const { enrollments, ...s } of students) {
        rows.push({
          ...s,
          assignmentId: a.id,
          subject: a.subject.name,
          level: a.level.name,
          total: enrollments.length,
          attended: enrollments.filter((e) => e.status === EnrollmentStatus.ATTENDED).length,
          absent: enrollments.filter((e) => e.status === EnrollmentStatus.ABSENT).length,
          pending: enrollments.filter(
            (e) =>
              e.status === EnrollmentStatus.ENROLLED &&
              (e.tutoringSession.status === SessionStatus.SCHEDULED ||
                e.tutoringSession.status === SessionStatus.IN_PROGRESS),
          ).length,
        });
      }
    }
    return rows;
  }

  @Roles(...READ_ROLES)
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un docente por id (incluye asignaciones y disponibilidad)' })
  findOne(@Param('id') id: string) {
    return this.teachers.findOne(id);
  }

  @Roles(...WRITE_ROLES)
  @Patch(':id')
  @ApiOperation({ summary: 'Editar datos de un docente (Admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateTeacherDto) {
    return this.teachers.update(id, dto);
  }

  @Roles(...WRITE_ROLES)
  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar un docente (Admin)',
    description: 'Solo si no tiene asignaciones ni tutorías asociadas — si tiene, 409 (usar isActive en su lugar).',
  })
  remove(@Param('id') id: string) {
    return this.teachers.remove(id);
  }

  // ── Asignaciones docente-materia-nivel ──────────────────────────────
  @Roles(...WRITE_ROLES)
  @Post('assignments')
  @ApiOperation({
    summary: 'Asignar a un docente una materia+nivel para un período (Admin)',
    description: 'Regla 5: única combinación docente+materia+nivel+período — 409 si ya existe.',
  })
  createAssignment(@Body() dto: CreateTeacherAssignmentDto) {
    return this.assignments.create(dto);
  }

  @Roles(...READ_ROLES)
  @Get('assignments/list')
  @ApiOperation({ summary: 'Listar asignaciones, opcionalmente filtradas por docente/período' })
  findAssignments(
    @Query('teacherId') teacherId?: string,
    @Query('academicPeriodId') academicPeriodId?: string,
  ) {
    return this.assignments.findAll({ teacherId, academicPeriodId });
  }

  @Roles(...WRITE_ROLES)
  @Patch('assignments/:id')
  @ApiOperation({ summary: 'Activar/desactivar una asignación docente-materia-nivel (Admin)' })
  updateAssignment(@Param('id') id: string, @Body() dto: UpdateTeacherAssignmentDto) {
    return this.assignments.update(id, dto);
  }
}
