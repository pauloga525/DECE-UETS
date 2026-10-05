'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Student } from '@/lib/types';
import { fullName } from '@/lib/format';
import { Spinner } from '@/components/ui/EmptyState';

const PAGE_SIZE = 10;

/** Minúsculas y sin tildes: "Acuña" coincide con "acuna". */
function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Selector de estudiantes de un nivel con buscador en vivo, filtro por paralelo y paginación.
 * Una tutoría puede reunir alumnos de distintos paralelos del mismo nivel (pedido
 * 2026-10-02): cada alumno muestra el suyo. Carga una vez los alumnos del nivel (~400) y
 * filtra en el navegador.
 */
export function StudentPicker({
  levelId,
  assignmentId,
  parallelId,
  isSelected,
  canAddMore,
  onAdd,
  addLabel = 'Agregar',
}: {
  levelId: string;
  /**
   * Asignación (materia+nivel) del bloque: limita a los paralelos donde el docente dicta esa
   * materia. Los alumnos que el docente tiene solo como animador no aparecen (pedido 2026-10-05).
   */
  assignmentId?: string;
  /** Opcional: limitar a un paralelo fijo. Sin él, todo el nivel con filtro opcional. */
  parallelId?: string;
  isSelected: (studentId: string) => boolean;
  canAddMore: boolean;
  onAdd: (student: Student) => void;
  addLabel?: string;
}) {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [parallelFilter, setParallelFilter] = useState('');

  useEffect(() => {
    if (!levelId) return;
    setStudents(null);
    setError(false);
    setQuery('');
    setPage(0);
    setParallelFilter('');
    api
      .get<Student[]>(
        `/students?${assignmentId ? `assignmentId=${assignmentId}` : `levelId=${levelId}`}${parallelId ? `&parallelId=${parallelId}` : ''}`,
      )
      .then((all) => setStudents(all.filter((s) => s.isActive)))
      .catch(() => setError(true));
  }, [levelId, assignmentId, parallelId]);

  const parallels = useMemo(
    () =>
      [...new Set((students ?? []).map((s) => s.parallel?.name).filter((n): n is string => !!n))].sort((a, b) =>
        a.localeCompare(b, 'es', { numeric: true }),
      ),
    [students],
  );

  const filtered = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (!students) return [];
    return students.filter((s) => {
      if (parallelFilter && s.parallel?.name !== parallelFilter) return false;
      const hay = normalize(`${s.firstName} ${s.lastName} ${s.identification}`);
      return words.every((w) => hay.includes(w));
    });
  }, [students, query, parallelFilter]);

  useEffect(() => setPage(0), [query, parallelFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="mb-4">
      <div className="mb-3 flex flex-wrap gap-2">
      <div className="relative min-w-56 flex-1">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          aria-label="Buscar estudiante"
          placeholder="Buscar por nombre, apellido o cédula…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-line py-2 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-ink-soft focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>
      {!parallelId && parallels.length > 1 && (
        <select
          aria-label="Filtrar por paralelo"
          value={parallelFilter}
          onChange={(e) => setParallelFilter(e.target.value)}
          className="rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="">Todos los paralelos</option>
          {parallels.map((p) => (
            <option key={p} value={p}>
              Paralelo {p}
            </option>
          ))}
        </select>
      )}
      </div>

      {error && <p className="text-sm text-status-danger">No se pudieron cargar los estudiantes.</p>}
      {!error && !students && <Spinner />}
      {students && filtered.length === 0 && (
        <p className="rounded-md bg-paper px-3 py-3 text-sm text-ink-soft">
          {students.length === 0 ? 'Este nivel no tiene estudiantes activos.' : 'Ningún estudiante coincide con la búsqueda.'}
        </p>
      )}

      {pageItems.length > 0 && (
        <>
          <ul className="divide-y divide-line rounded-md border border-line">
            {pageItems.map((s) => {
              const already = isSelected(s.id);
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{fullName(s)}</span>
                    <span className="text-xs text-ink-soft">
                      <span className="font-mono">{s.identification}</span>
                      {s.parallel && (
                        <span className="ml-2 rounded-full bg-status-scheduled-tint px-2 py-0.5 font-medium text-status-scheduled">
                          Paralelo {s.parallel.name}
                        </span>
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={already || !canAddMore}
                    onClick={() => onAdd(s)}
                    className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-tint disabled:cursor-not-allowed disabled:text-ink-soft disabled:hover:bg-transparent"
                  >
                    {already ? 'Agregado' : addLabel}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center justify-between text-xs text-ink-soft">
            <span>
              {current * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE + PAGE_SIZE, filtered.length)} de {filtered.length}
              {(query || parallelFilter) && students ? ` (de ${students.length} en el nivel)` : ''}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0} className="rounded-md border border-line px-2.5 py-1 hover:border-accent disabled:opacity-40">
                  ‹ Anterior
                </button>
                <span className="px-2 font-mono">
                  {current + 1}/{totalPages}
                </span>
                <button type="button" onClick={() => setPage(current + 1)} disabled={current >= totalPages - 1} className="rounded-md border border-line px-2.5 py-1 hover:border-accent disabled:opacity-40">
                  Siguiente ›
                </button>
              </div>
            )}
          </div>
        </>
      )}
      {!canAddMore && students && <p className="mt-2 text-xs text-status-warning">Se alcanzó el cupo máximo de estudiantes de esta tutoría.</p>}
    </div>
  );
}
