import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { IsId } from '../../../common/is-id.validator';

export class CreateStudentDto {
  @IsString()
  @MinLength(2)
  firstName!: string;

  @IsString()
  @MinLength(2)
  lastName!: string;

  @IsString()
  @MinLength(5)
  identification!: string;

  @IsId()
  levelId!: string;

  @IsId()
  parallelId!: string;
}

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  lastName?: string;

  @IsOptional()
  @IsId()
  levelId?: string;

  @IsOptional()
  @IsId()
  parallelId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
