import { Matches, ValidationOptions } from 'class-validator';

const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Identificador con formato UUID, de cualquier versión. @IsUUID() exige v4 (o una versión
 * conocida) y rechazaba el período sembrado con id fijo 00000000-0000-0000-0000-000000000001,
 * con lo que "Agregar asignación" fallaba con 400.
 */
export function IsId(options?: ValidationOptions) {
  return Matches(UUID_FORMAT, { message: `$property debe ser un identificador válido`, ...options });
}
