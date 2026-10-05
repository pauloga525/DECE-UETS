import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceRecordInput } from './record-attendance.dto';

/** Informe de cierre de la tutoría (pedido 7/9/2026). */
export class TutoringReportInput {
  @ApiProperty({ description: 'Destrezas trabajadas en la tutoría' })
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  skills!: string;

  @ApiProperty({ description: 'Observaciones del docente' })
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  observations!: string;

  @ApiPropertyOptional({ description: 'Tareas asignadas a los estudiantes' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  tasks?: string;
}

/** Guardar la lista (parcial o completa) durante la tutoría en curso. */
export class SaveAttendanceDto {
  @ApiProperty({ type: () => AttendanceRecordInput, isArray: true })
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordInput)
  records!: AttendanceRecordInput[];
}

/**
 * Finalizar (IN_PROGRESS → COMPLETED) o completar el informe pendiente de una tutoría que
 * el sistema cerró sola a los 40 min. `records` permite registrar/corregir asistencia en el
 * mismo paso.
 */
export class CloseSessionDto {
  /**
   * Lista de asistencia al cerrar (pedido 2026-10-02): inscripciones que SÍ asistieron;
   * el resto queda como ausente. Alternativa simple a `records`.
   */
  @ApiPropertyOptional({ type: [String], description: 'Inscripciones presentes; las demás quedan ausentes' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  presentEnrollmentIds?: string[];

  @ApiPropertyOptional({ type: () => AttendanceRecordInput, isArray: true })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordInput)
  records?: AttendanceRecordInput[];

  @ApiProperty({ type: () => TutoringReportInput })
  @ValidateNested()
  @Type(() => TutoringReportInput)
  report!: TutoringReportInput;
}

/** Iniciar la tutoría tomando lista (pedido 2026-10-02). */
export class StartSessionDto {
  @ApiPropertyOptional({ type: [String], description: 'Inscripciones presentes al iniciar; las demás quedan ausentes' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  presentEnrollmentIds?: string[];
}
