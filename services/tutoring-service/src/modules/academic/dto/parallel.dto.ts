import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsId } from '../../../common/is-id.validator';

export class CreateParallelDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsId()
  levelId!: string;
}

export class UpdateParallelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Animador del curso: correo institucional. null o "" lo quita. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() || null : value))
  @ValidateIf((_o, v) => v !== null)
  @IsEmail()
  @Matches(/@uets\.edu\.ec$/, { message: 'El animador debe tener un correo @uets.edu.ec' })
  animatorEmail?: string | null;
}
