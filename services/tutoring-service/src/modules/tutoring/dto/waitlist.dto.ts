import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EnrollmentReason } from '@prisma/client';
import { IsId } from '../../../common/is-id.validator';

export class AddToWaitlistDto {
  @ApiProperty({ format: 'uuid' })
  @IsId()
  studentId!: string;

  @ApiProperty({ enum: EnrollmentReason })
  @IsEnum(EnrollmentReason)
  reason!: EnrollmentReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonNote?: string;
}
