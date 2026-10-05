// Regla 1, sección 4 del plan: todo bloque de tutoría dura exactamente 40 minutos.
export const BLOCK_DURATION_MINUTES = 40;

/** "08:00" -> 480 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 480 -> "08:00" */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/** true si el rango [start, end) es un múltiplo exacto de 40 minutos y end > start. */
export function isMultipleOfBlock(startTime: string, endTime: string): boolean {
  const diff = timeToMinutes(endTime) - timeToMinutes(startTime);
  return diff > 0 && diff % BLOCK_DURATION_MINUTES === 0;
}

/** Divide un rango de disponibilidad en bloques fijos de 40 minutos. */
export function splitIntoBlocks(
  startTime: string,
  endTime: string,
): Array<{ startTime: string; endTime: string }> {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const blocks: Array<{ startTime: string; endTime: string }> = [];
  for (
    let t = startMinutes;
    t + BLOCK_DURATION_MINUTES <= endMinutes;
    t += BLOCK_DURATION_MINUTES
  ) {
    blocks.push({
      startTime: minutesToTime(t),
      endTime: minutesToTime(t + BLOCK_DURATION_MINUTES),
    });
  }
  return blocks;
}

/** true si [aStart, aEnd) y [bStart, bEnd) se solapan. */
export function timeRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}

/**
 * Desfase horario de la institución respecto a UTC, en minutos. Ecuador continental es
 * UTC−5 todo el año (sin horario de verano), así que un desfase fijo es exacto.
 * Configurable por si el servicio corre para otra zona: SCHOOL_UTC_OFFSET_MINUTES.
 */
export function schoolUtcOffsetMinutes(): number {
  const raw = process.env.SCHOOL_UTC_OFFSET_MINUTES;
  return raw && Number.isFinite(Number(raw)) ? Number(raw) : -300;
}

/**
 * Instante real (UTC) de una hora "HH:mm" de la agenda en un día dado. `date` es la columna
 * @db.Date de la sesión (medianoche UTC del día de calendario local).
 */
export function sessionInstant(date: Date, time: string, offsetMinutes = schoolUtcOffsetMinutes()): Date {
  const midnightUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return new Date(midnightUtc + (timeToMinutes(time) - offsetMinutes) * 60_000);
}

/** Minutos antes del inicio programado desde los que el docente puede iniciar la tutoría. */
export const START_EARLY_MINUTES = 10;
