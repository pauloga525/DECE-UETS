export function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('es-EC', { weekday: 'short', day: '2-digit', month: 'short' });
}

export function toDateInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

/** " · Paralelos A, B" de una asignación docente-materia-nivel (vacío si cubre todo el nivel). */
export function parallelsSuffix(a: { parallels?: { parallel?: { name: string } }[] }): string {
  const names = (a.parallels ?? []).map((p) => p.parallel?.name).filter(Boolean);
  if (!names.length) return '';
  return ` · ${names.length === 1 ? 'Paralelo' : 'Paralelos'} ${names.join(', ')}`;
}
