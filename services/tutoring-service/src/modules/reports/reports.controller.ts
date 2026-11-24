import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { isAnimator, resolveAnimatorParallel } from '../animator/animator-scope';
import { ReportsService } from './reports.service';
import { ComplianceInclude, ScheduleComplianceService } from './schedule-compliance.service';
import { UnfulfilledReportService } from './unfulfilled.service';
import { AbsencesReportService } from './absences.service';

const asInclude = (v?: string): ComplianceInclude => (v === 'pending' || v === 'complete' ? v : 'all');
import { ReportFiltersDto } from './dto/report-filters.dto';

// El animador genera reportes ÚNICAMENTE de su curso (pedido 2026-09-30): su parallelId se
// fuerza en el servidor, no depende de lo que mande el frontend. El docente entra aquí solo
// como animador: sin curso asignado, resolveAnimatorParallel responde 403.
const REPORT_ROLES = [
  UserRole.ADMIN,
  UserRole.PSYCHOLOGY_COORDINATOR,
  UserRole.PSYCHOLOGIST,
  UserRole.ANIMATOR,
  UserRole.TEACHER,
];

@ApiTags('reports')
@ApiBearerAuth()
@Roles(...REPORT_ROLES)
@Controller('reports')
export class ReportsController {
  constructor(
    private reports: ReportsService,
    private compliance: ScheduleComplianceService,
    private unfulfilled: UnfulfilledReportService,
    private absences: AbsencesReportService,
    private prisma: PrismaService,
  ) {}

  private async scoped(filters: ReportFiltersDto, user: AuthenticatedUser): Promise<ReportFiltersDto> {
    if (!isAnimator(user)) return filters;
    return { ...filters, parallelId: await resolveAnimatorParallel(this.prisma, user, filters.parallelId) };
  }

  @Get('summary')
  @ApiOperation({
    summary: 'KPIs generales (Admin/DECE)',
    description:
      'Total de tutorías, estudiantes atendidos, inasistencias, canceladas, materia con mayor demanda.',
  })
  async summary(@Query() filters: ReportFiltersDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.summary(await this.scoped(filters, user));
  }

  @Get('by-month')
  @ApiOperation({ summary: 'Conteo de tutorías por mes (Admin/DECE)' })
  async byMonth(@Query() filters: ReportFiltersDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.byMonth(await this.scoped(filters, user));
  }

  @Get('by-subject')
  @ApiOperation({ summary: 'Conteo de tutorías por materia (Admin/DECE)' })
  async bySubject(@Query() filters: ReportFiltersDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.bySubject(await this.scoped(filters, user));
  }

  @Get('by-teacher')
  @ApiOperation({ summary: 'Conteo de tutorías por docente (Admin/DECE)' })
  async byTeacher(@Query() filters: ReportFiltersDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.byTeacher(await this.scoped(filters, user));
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="reporte-tutorias.csv"')
  @ApiOperation({
    summary: 'Exportar el detalle en CSV, con los mismos filtros (Admin/DECE)',
    description: 'Incluye BOM UTF-8 — se abre directamente en Excel sin corromper tildes/ñ.',
  })
  async exportCsv(@Query() filters: ReportFiltersDto, @CurrentUser() user: AuthenticatedUser) {
    const csv = await this.reports.exportCsv(await this.scoped(filters, user));
    // BOM para que Excel detecte UTF-8 (acentos/ñ) al abrir el CSV directamente.
    return '﻿' + csv;
  }

  @Get('students-registry')
  @ApiOperation({
    summary: 'Registro de tutorías por alumno: cantidad por materia y total del período',
    description:
      'count=scheduled (por defecto: asignadas, sin canceladas) o count=attended (solo asistidas). Mismos filtros que el resto.',
  })
  async studentsRegistry(@Query() filters: ReportFiltersDto, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.studentRegistry(await this.scoped(filters, user));
  }

  @Get('students-registry.xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="registro-tutorias.xlsx"')
  @ApiOperation({ summary: 'Registro de tutorías por alumno en Excel (.xlsx)' })
  async studentsRegistryXlsx(@Query() filters: ReportFiltersDto, @CurrentUser() user: AuthenticatedUser) {
    return new StreamableFile(await this.reports.studentRegistryXlsx(await this.scoped(filters, user)));
  }

  // ── Tutorías no realizadas o no completadas (pedido 2026-11-24) ──────
  // Mismos roles y alcance que el resto de reportes (el animador, solo su curso).
  // filters.kind=NOT_HELD|NOT_CLOSED|CANCELLED (opcional; sin él, las tres).
  @Get('unfulfilled')
  @ApiOperation({
    summary: 'Tutorías no realizadas, no finalizadas por el docente o canceladas',
    description: 'Filtros comunes (período, docente, materia, nivel, paralelo, from/to) y kind opcional.',
  })
  async unfulfilledReport(
    @Query() filters: ReportFiltersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.unfulfilled.compute(await this.scoped(filters, user), filters.kind);
  }

  @Get('unfulfilled.xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="tutorias-no-realizadas.xlsx"')
  @ApiOperation({ summary: 'Tutorías no realizadas o no completadas, en Excel' })
  async unfulfilledXlsx(
    @Query() filters: ReportFiltersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return new StreamableFile(await this.unfulfilled.xlsx(await this.scoped(filters, user), filters.kind));
  }

  @Get('unfulfilled.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="tutorias-no-realizadas.pdf"')
  @ApiOperation({ summary: 'Tutorías no realizadas o no completadas, en PDF' })
  async unfulfilledPdf(
    @Query() filters: ReportFiltersDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return new StreamableFile(await this.unfulfilled.pdf(await this.scoped(filters, user), filters.kind));
  }

  // ── Inasistencias de estudiantes (pedido 2026-11-24) ────────────────
  @Get('absences')
  @ApiOperation({ summary: 'Estudiantes que no asistieron: materia, docente, fecha y observación del docente' })
  async absencesReport(@Query() filters: ReportFiltersDto, @CurrentUser() user: AuthenticatedUser) {
    return this.absences.compute(await this.scoped(filters, user));
  }

  @Get('absences.xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="inasistencias-estudiantes.xlsx"')
  @ApiOperation({ summary: 'Inasistencias de estudiantes, en Excel' })
  async absencesXlsx(@Query() filters: ReportFiltersDto, @CurrentUser() user: AuthenticatedUser) {
    return new StreamableFile(await this.absences.xlsx(await this.scoped(filters, user)));
  }

  @Get('absences.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="inasistencias-estudiantes.pdf"')
  @ApiOperation({ summary: 'Inasistencias de estudiantes, en PDF' })
  async absencesPdf(@Query() filters: ReportFiltersDto, @CurrentUser() user: AuthenticatedUser) {
    return new StreamableFile(await this.absences.pdf(await this.scoped(filters, user)));
  }

  // ── Cumplimiento de horarios (pedido 2026-10-13) ──────────────────────
  // Solo administrador y coordinador de psicólogos: supervisan que cada docente de cada
  // materia haya declarado su horario de tutorías.
  @Roles(UserRole.ADMIN, UserRole.PSYCHOLOGY_COORDINATOR)
  @Get('schedule-compliance')
  @ApiOperation({
    summary: 'Horarios de tutoría declarados: por materia, qué docentes ya cargaron su horario (Admin/Coordinador)',
  })
  scheduleCompliance(@Query('subjectId') subjectId?: string, @Query('academicPeriodId') academicPeriodId?: string) {
    return this.compliance.compute({ subjectId, academicPeriodId });
  }

  @Roles(UserRole.ADMIN, UserRole.PSYCHOLOGY_COORDINATOR)
  @Get('schedule-compliance.xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="horarios-docentes.xlsx"')
  @ApiOperation({ summary: 'Horarios de tutoría declarados, en Excel (Admin/Coordinador)' })
  async scheduleComplianceXlsx(
    @Query('subjectId') subjectId?: string,
    @Query('academicPeriodId') academicPeriodId?: string,
    @Query('include') include?: string,
  ) {
    return new StreamableFile(await this.compliance.xlsx({ subjectId, academicPeriodId, include: asInclude(include) }));
  }

  @Roles(UserRole.ADMIN, UserRole.PSYCHOLOGY_COORDINATOR)
  @Get('schedule-compliance.pdf')
  @Header('Content-Type', 'application/pdf')
  @Header('Content-Disposition', 'attachment; filename="horarios-docentes.pdf"')
  @ApiOperation({
    summary: 'Horarios de tutoría declarados, en PDF: por materia, docentes que faltan y que ya cargaron (Admin/Coordinador)',
    description: 'subjectId opcional (sin él, todas las materias). include=all|pending|complete.',
  })
  async scheduleCompliancePdf(
    @Query('subjectId') subjectId?: string,
    @Query('academicPeriodId') academicPeriodId?: string,
    @Query('include') include?: string,
  ) {
    return new StreamableFile(await this.compliance.pdf({ subjectId, academicPeriodId, include: asInclude(include) }));
  }
}
