import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TUTORING_CAPACITY } from '../../../common/tutoring.constants';
import { StudentEnrollmentInput } from './schedule-session.dto';

export class AddEnrollmentsDto {
  @ApiProperty({ type: () => StudentEnrollmentInput, isArray: true, minItems: 1, maxItems: TUTORING_CAPACITY })
  @ValidateNested({ each: true })
  @Type(() => StudentEnrollmentInput)
  @ArrayMinSize(1)
  @ArrayMaxSize(TUTORING_CAPACITY)
  students!: StudentEnrollmentInput[];
}
