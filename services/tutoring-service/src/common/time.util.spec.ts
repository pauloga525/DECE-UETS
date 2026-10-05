import {
  BLOCK_DURATION_MINUTES,
  isMultipleOfBlock,
  minutesToTime,
  splitIntoBlocks,
  timeRangesOverlap,
  timeToMinutes,
} from './time.util';

describe('time.util', () => {
  it('converts HH:mm to minutes and back', () => {
    expect(timeToMinutes('08:00')).toBe(480);
    expect(timeToMinutes('00:00')).toBe(0);
    expect(minutesToTime(480)).toBe('08:00');
    expect(minutesToTime(65)).toBe('01:05');
  });

  it('accepts only ranges that are exact multiples of 40 minutes', () => {
    expect(isMultipleOfBlock('08:00', '08:40')).toBe(true);
    expect(isMultipleOfBlock('08:00', '10:40')).toBe(true);
    expect(isMultipleOfBlock('08:00', '09:00')).toBe(false); // 60 min, no múltiplo
    expect(isMultipleOfBlock('08:00', '08:00')).toBe(false); // rango vacío
    expect(isMultipleOfBlock('09:00', '08:00')).toBe(false); // invertido
  });

  it('splits a window into fixed 40-minute blocks, discarding a trailing remainder', () => {
    expect(splitIntoBlocks('08:00', '09:20')).toEqual([
      { startTime: '08:00', endTime: '08:40' },
      { startTime: '08:40', endTime: '09:20' },
    ]);
    // 90 minutos: solo caben 2 bloques completos de 40, el resto (10 min) no genera bloque.
    expect(splitIntoBlocks('08:00', '09:30')).toHaveLength(2);
  });

  it('detects overlapping and non-overlapping time ranges', () => {
    expect(timeRangesOverlap('08:00', '08:40', '08:40', '09:20')).toBe(false); // bloques contiguos, no solapan
    expect(timeRangesOverlap('08:00', '08:40', '08:20', '09:00')).toBe(true);
    expect(timeRangesOverlap('08:00', '08:40', '09:00', '09:40')).toBe(false);
  });

  it('the fixed block duration is 40 minutes (regla 1, sección 4)', () => {
    expect(BLOCK_DURATION_MINUTES).toBe(40);
  });
});
