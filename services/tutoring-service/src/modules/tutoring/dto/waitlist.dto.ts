import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EnrollmentReason } from '@prisma/client';

export class AddToWaitlistDto {
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
