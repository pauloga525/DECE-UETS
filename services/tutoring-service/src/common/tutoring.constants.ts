/**
 * Cupo máximo de estudiantes por tutoría (regla 2). Era 5; pasó a 10 el 2026-10-05 a pedido
 * del DECE. Cambiarlo aquí ajusta la generación de bloques y las validaciones; para los
 * bloques ya existentes hace falta además una migración (ver tutoria_cupo_10).
 */
export const TUTORING_CAPACITY = 10;
