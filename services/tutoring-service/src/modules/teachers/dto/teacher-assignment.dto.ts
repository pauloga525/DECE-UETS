import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateTeacherAssignmentDto {
  @IsUUID()
  teacherId!: string;

  @IsUUID()
  subjectId!: string;

  @IsUUID()
  levelId!: string;

  @IsUUID()
  academicPeriodId!: string;

  /** Paralelos donde dicta la materia. Vacío u omitido = todo el nivel. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  parallelIds?: string[];
}

export class UpdateTeacherAssignmentDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Reemplaza los paralelos de la asignación. Vacío = todo el nivel. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  parallelIds?: string[];
}
