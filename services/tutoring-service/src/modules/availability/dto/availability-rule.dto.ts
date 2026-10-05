import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DayOfWeek } from '@prisma/client';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAvailabilityRuleDto {
  // El horario cuelga de una asignación materia+nivel concreta, no del docente en general
  // (ver comentario en TeacherAvailabilityRule, schema.prisma) — de ahí sale también el
  // docente y el período, sin necesidad de repetirlos aquí.
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  teacherAssignmentId!: string;

  @ApiProperty({ enum: DayOfWeek })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ example: '08:00', pattern: TIME_PATTERN.source })
  @Matches(TIME_PATTERN, { message: 'startTime debe tener formato HH:mm' })
  startTime!: string;

  @ApiProperty({ example: '10:40', pattern: TIME_PATTERN.source })
  @Matches(TIME_PATTERN, { message: 'endTime debe tener formato HH:mm' })
  endTime!: string;

  @ApiProperty({ example: 'Aula 204 · Bloque B', description: 'Lugar donde se darán estas tutorías' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  location!: string;
}

export class UpdateAvailabilityRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Cambiar el lugar: se aplica también a los bloques libres futuros' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  location?: string;
}
