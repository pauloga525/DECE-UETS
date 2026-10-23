import { IsArray, IsBoolean, IsOptional } from 'class-validator';
import { IsId } from '../../../common/is-id.validator';

export class CreateTeacherAssignmentDto {
  @IsId()
  teacherId!: string;

  @IsId()
  subjectId!: string;

  @IsId()
  levelId!: string;

  @IsId()
  academicPeriodId!: string;

  /** Paralelos donde dicta la materia. Vacío u omitido = todo el nivel. */
  @IsOptional()
  @IsArray()
  @IsId({ each: true })
  parallelIds?: string[];
}

export class UpdateTeacherAssignmentDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Reemplaza los paralelos de la asignación. Vacío = todo el nivel. */
  @IsOptional()
  @IsArray()
  @IsId({ each: true })
  parallelIds?: string[];
}
