import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { IsId } from '../../../common/is-id.validator';

export class CreateLevelDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsInt()
  order!: number;

  @IsId()
  academicPeriodId!: string;
}

export class UpdateLevelDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
