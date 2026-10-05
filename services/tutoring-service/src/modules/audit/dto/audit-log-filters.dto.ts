import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogFiltersDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filtrar por quién ejecutó la acción' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    example: 'SCHEDULE',
    description: 'ej. CREATE, CANCEL, SCHEDULE, PASSWORD_RESET…',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ example: 'TutoringSession' })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-15' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
