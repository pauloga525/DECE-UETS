import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  code!: string;

  @IsOptional()
  @IsBoolean()
  isTechnical?: boolean;
}

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Materia técnica: sus horarios de tutoría pueden cruzarse con otras técnicas. */
  @IsOptional()
  @IsBoolean()
  isTechnical?: boolean;
}
