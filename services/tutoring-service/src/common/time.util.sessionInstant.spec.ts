import { sessionInstant } from './time.util';

describe('sessionInstant (hora local de Ecuador → UTC)', () => {
  const day = new Date('2026-10-05T00:00:00.000Z'); // columna @db.Date

  it('08:00 en Ecuador (UTC−5) son las 13:00 UTC', () => {
    expect(sessionInstant(day, '08:00', -300).toISOString()).toBe('2026-10-05T13:00:00.000Z');
  });

  it('una tutoría de 20:00 termina al día siguiente en UTC', () => {
    expect(sessionInstant(day, '20:40', -300).toISOString()).toBe('2026-10-06T01:40:00.000Z');
  });
});
