import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SessionStatus, UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { TutoringSessionsService } from './tutoring-sessions.service';
import { AttendanceService } from './attendance.service';
import { WaitlistService } from './waitlist.service';
import { ScheduleSessionDto } from './dto/schedule-session.dto';
import { AddEnrollmentsDto } from './dto/add-enrollments.dto';
import { CancelSessionDto } from './dto/cancel-session.dto';
import { RescheduleSessionDto } from './dto/reschedule-session.dto';
import { CloseSessionDto, SaveAttendanceDto, StartSessionDto } from './dto/session-report.dto';
import { AddToWaitlistDto } from './dto/waitlist.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { findTeacherOfUser } from '../teachers/teacher-of-user';

const READ_ROLES = [UserRole.ADMIN, UserRole.PSYCHOLOGY_COORDINATOR, UserRole.PSYCHOLOGIST, UserRole.TEACHER];
const PSYCHOLOGY_ROLES = [UserRole.ADMIN, UserRole.PSYCHOLOGY_COORDINATOR, UserRole.PSYCHOLOGIST];
// Agendar/sumar estudiantes: el DECE para cualquier docente; el docente solo en sus propios
// bloques (validado en el servicio con assertActsOnOwnTeacher) — pedido 7/9/2026.
const SCHEDULE_ROLES = [...PSYCHOLOGY_ROLES, UserRole.TEACHER];
const TEACHER_ROLES = [UserRole.ADMIN, UserRole.TEACHER];
const CANCEL_ROLES = [UserRole.ADMIN, UserRole.PSYCHOLOGY_COORDINATOR, UserRole.PSYCHOLOGIST, UserRole.TEACHER];

@ApiTags('tutoring')
@ApiBearerAuth()
@Controller('tutoring/sessions')
export class TutoringController {
  constructor(
    private sessions: TutoringSessionsService,
    private attendance: AttendanceService,
    private waitlist: WaitlistService,
    private prisma: PrismaService,
  ) {}

  @Roles(...READ_ROLES)
  @Get()
  @ApiOperation({
    summary: 'Agenda de tutorías — filtrable por fecha o rango (from/to), docente y estado. El docente solo ve la suya.',
  })
  async findAgenda(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('teacherId') teacherId?: string,
    @Query('status') status?: SessionStatus,
  ) {
    // El docente ve su propia agenda, no la de otros docentes.
    if (user.role === UserRole.TEACHER) {
      const own = await findTeacherOfUser(this.prisma, user);
      teacherId = own?.id ?? '00000000-0000-0000-0000-000000000000';
    }
    return this.sessions.findAgenda({ date, from, to, teacherId, status });
  }

  @Roles(...READ_ROLES)
  @Get('available')
  @ApiOperation({
    summary: 'Bloques elegibles de un docente en una fecha (paso 3 del flujo de creación)',
    description:
      'Incluye AVAILABLE (agendar tutoría nueva) y SCHEDULED con cupo libre (sumar estudiantes a una existente). Ya vienen con materia y nivel puestos — los fijó el docente al declarar su horario.',
  })
  findAvailableBlocks(@Query('teacherId') teacherId: string, @Query('date') date: string) {
    return this.sessions.findAvailableBlocks(teacherId, date);
  }

  @Roles(...READ_ROLES)
  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de una tutoría (docente, materia, estudiantes, lista de espera)',
  })
  findOne(@Param('id') id: string) {
    return this.sessions.findOne(id);
  }

  @Roles(...SCHEDULE_ROLES)
  @Post(':id/schedule')
  @ApiOperation({
    summary: 'Confirmar la creación de una tutoría (paso 5): AVAILABLE → SCHEDULED (CU-03)',
    description:
      'Solo pide paralelo y estudiantes — materia y nivel ya vienen fijos en el bloque. ' +
      'Bloqueo pesimista (SELECT ... FOR UPDATE) — dos peticiones simultáneas por el último cupo nunca producen 6/5.',
  })
  schedule(
    @Param('id') id: string,
    @Body() dto: ScheduleSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessions.scheduleSession(id, dto, user);
  }

  @Roles(...SCHEDULE_ROLES)
  @Post(':id/enrollments')
  @ApiOperation({ summary: 'Agregar estudiantes a una tutoría ya SCHEDULED (CU-04)' })
  addEnrollments(
    @Param('id') id: string,
    @Body() dto: AddEnrollmentsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessions.addEnrollments(id, dto.students, user);
  }

  // CU-05: el docente inicia el bloque — a partir de aquí materia/nivel/paralelo quedan fijos (regla 4).
  @Roles(...TEACHER_ROLES)
  @Post(':id/start')
  @ApiOperation({
    summary: 'Iniciar la tutoría: SCHEDULED → IN_PROGRESS (Docente)',
    description:
      'Solo el docente de la tutoría, dentro de su horario (desde 10 min antes), y sin otra tutoría en curso.',
  })
  start(@Param('id') id: string, @Body() dto: StartSessionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sessions.startSession(id, user, new Date(), dto?.presentEnrollmentIds);
  }

  @Roles(...TEACHER_ROLES)
  @Post(':id/attendance')
  @ApiOperation({ summary: 'Tomar lista durante la tutoría en curso (guardado parcial permitido)' })
  saveAttendance(
    @Param('id') id: string,
    @Body() dto: SaveAttendanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendance.saveAttendance(id, dto.records, user);
  }

  // CU-05 / pantalla 15: exige asistencia completa e informe (destrezas, observaciones, tareas).
  @Roles(...TEACHER_ROLES)
  @Post(':id/complete')
  @ApiOperation({
    summary: 'Finalizar: IN_PROGRESS → COMPLETED con informe de cierre (Docente)',
    description: 'Exige asistencia de todos los estudiantes inscritos y el informe, o rechaza con 400.',
  })
  complete(
    @Param('id') id: string,
    @Body() dto: CloseSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendance.completeSession(id, dto, user);
  }

  // Tutoría cerrada automáticamente a los 40 min: el docente completa el informe después.
  @Roles(...TEACHER_ROLES)
  @Post(':id/report')
  @ApiOperation({
    summary: 'Registrar el informe pendiente de una tutoría cerrada automáticamente (Docente)',
  })
  submitReport(
    @Param('id') id: string,
    @Body() dto: CloseSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attendance.submitPendingReport(id, dto, user);
  }

  // CU-06: cancelación no destructiva (regla 14) — motivo obligatorio.
  @Roles(...CANCEL_ROLES)
  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancelar una tutoría (Admin/DECE/Docente)',
    description:
      'No destructiva (regla 14): cambia de estado y guarda motivo, nunca borra el registro.',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessions.cancelSession(id, dto.reason, user);
  }

  // CU-07: revalida todo contra el bloque destino (regla 13).
  @Roles(...PSYCHOLOGY_ROLES)
  @Post(':id/reschedule')
  @ApiOperation({
    summary: 'Reprogramar a otro bloque AVAILABLE (Admin/DECE)',
    description:
      'Revalida todo contra el destino (regla 13): misma materia y nivel, capacidad y solapes de cada estudiante.',
  })
  reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessions.rescheduleSession(id, dto.newSessionId, user.userId);
  }

  // CU-08: pantalla 13 — solo tiene sentido cuando el bloque está lleno (cupo completo).
  @Roles(...PSYCHOLOGY_ROLES)
  @Post(':id/waitlist')
  @ApiOperation({
    summary: 'Agregar un estudiante a la lista de espera de un bloque lleno (Admin/DECE)',
  })
  addToWaitlist(
    @Param('id') id: string,
    @Body() dto: AddToWaitlistDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.waitlist.addToWaitlist(id, dto, user.userId);
  }
}

@ApiTags('tutoring')
@ApiBearerAuth()
@Controller('tutoring/enrollments')
export class EnrollmentsController {
  constructor(private waitlist: WaitlistService) {}

  // CU-08: cancelar promueve automáticamente al primero de la lista de espera (regla 12).
  @Roles(...PSYCHOLOGY_ROLES)
  @Delete(':id')
  @ApiOperation({
    summary: 'Cancelar una inscripción (Admin/DECE)',
    description:
      'Si hay lista de espera para el mismo bloque, promueve automáticamente al primero (regla 12).',
  })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.waitlist.cancelEnrollment(id, user.userId);
  }
}
