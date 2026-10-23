import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsId } from '../../../common/is-id.validator';

// Filtros comunes a los endpoints de reportes (pantalla 23): período, docente, materia, nivel, rango de fechas.
export class ReportFiltersDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsId()
  academicPeriodId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsId()
  teacherId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsId()
  subjectId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsId()
  levelId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Curso (paralelo). Para el animador se fuerza a su curso.' })
  @IsOptional()
  @IsId()
  parallelId?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-15' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: ['scheduled', 'attended'],
    description: 'Registro por alumno: contar tutorías asignadas (por defecto) o solo a las que asistió',
  })
  @IsOptional()
  @IsIn(['scheduled', 'attended'])
  count?: 'scheduled' | 'attended';
}
