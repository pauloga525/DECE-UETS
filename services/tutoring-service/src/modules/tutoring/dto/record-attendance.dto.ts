import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';
import { IsId } from '../../../common/is-id.validator';

export class AttendanceRecordInput {
  @ApiProperty({ format: 'uuid' })
  @IsId()
  enrollmentId!: string;

  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class RecordAttendanceDto {
  @ApiProperty({ type: () => AttendanceRecordInput, isArray: true, minItems: 1 })
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordInput)
  @ArrayMinSize(1)
  records!: AttendanceRecordInput[];
}
