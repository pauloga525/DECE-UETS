import { IsString, MinLength } from 'class-validator';

// Regla 14, sección 4: la cancelación exige motivo obligatorio y nunca borra el registro.
export class CancelSessionDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
