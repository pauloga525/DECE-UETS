import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { isAnimator, resolveAnimatorParallel } from '../animator/animator-scope';
import { ReportsService } from './reports.service';
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
}
