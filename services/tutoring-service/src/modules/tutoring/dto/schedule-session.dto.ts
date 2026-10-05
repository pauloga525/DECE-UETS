import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TUTORING_CAPACITY } from '../../../common/tutoring.constants';
import { EnrollmentReason } from '@prisma/client';

export class StudentEnrollmentInput {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ enum: EnrollmentReason })
  @IsEnum(EnrollmentReason)
  reason!: EnrollmentReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonNote?: string;
}

// Pasos 4-5 del flujo de creación de tutoría (sección 6 del plan, reducido a 5 pasos):
// el bloque elegido ya trae materia+nivel fijos (los puso el docente al declarar su horario) —
// solo falta paralelo (obligatorio, decisión de alcance) y hasta TUTORING_CAPACITY (10) estudiantes con motivo.
export class ScheduleSessionDto {
  // Obsoleto desde 2026-10-02: la tutoría puede mezclar paralelos del nivel; se ignora.
  @ApiPropertyOptional({ format: 'uuid', deprecated: true })
  @IsOptional()
  @IsUUID()
  parallelId?: string;

  // Espacio físico de la tutoría. Por defecto se toma el lugar que el docente declaró en su
  // horario (pedido 2026-10-02); solo hace falta enviarlo para cambiarlo en esta tutoría.
  @ApiPropertyOptional({ example: 'Aula 204 · Bloque B' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  location?: string;

  @ApiProperty({ type: () => StudentEnrollmentInput, isArray: true, minItems: 1, maxItems: TUTORING_CAPACITY })
  @ValidateNested({ each: true })
  @Type(() => StudentEnrollmentInput)
  @ArrayMinSize(1)
  @ArrayMaxSize(TUTORING_CAPACITY)
  students!: StudentEnrollmentInput[];
}
