import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateLevelDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsInt()
  order!: number;

  @IsUUID()
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
