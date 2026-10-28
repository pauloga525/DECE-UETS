'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { Level, TeacherAssignment } from '@/lib/types';
import { fullName } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';
import { PencilIcon, TrashIcon } from '@/components/ui/icons';

import { Pagination, usePagination } from '@/components/ui/Pagination';
export default function TeacherAssignmentsOverviewPage() {
  // Admin y DECE pueden editar paralelos, activar/desactivar y quitar materias (pedido 2026-10-27).
  useRequireAuth(['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST']);
  const [assignments, setAssignments] = useState<TeacherAssignment[] | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string; parallelIds: string[] } | null>(null);

  const load = useCallback(() => {
    api
      .get<TeacherAssignment[]>('/teachers/assignments/list')
      .then(setAssignments)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
    api.get<Level[]>('/academic/levels').then(setLevels).catch(() => setLevels([]));
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (assignments ?? []).filter(
      (a) =>
        !q ||
        `${a.teacher ? fullName(a.teacher) : ''} ${a.subject?.name ?? ''} ${a.level?.name ?? ''}`.toLowerCase().includes(q),
    );
  }, [assignments, search]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setActionError(null);
    try {
      await action();
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
    }
  }

  const toggle = (a: TeacherAssignment) =>
    run(() => api.patch(`/teachers/assignments/${a.id}`, { isActive: !a.isActive }), 'No se pudo actualizar la asignación');

  const saveParallels = () =>
    editing &&
    run(async () => {
      await api.patch(`/teachers/assignments/${editing.id}`, { parallelIds: editing.parallelIds });
      setEditing(null);
    }, 'No se pudieron guardar los paralelos');

  function remove(a: TeacherAssignment) {
    const who = a.teacher ? fullName(a.teacher) : 'este docente';
    if (!window.confirm(`¿Quitar ${a.subject?.name} · ${a.level?.name} a ${who}? Se borran también sus horarios de tutoría.`)) return;
    run(() => api.delete(`/teachers/assignments/${a.id}`), 'No se pudo quitar la asignación');
  }

  const pg = usePagination(filtered);
  return (
    <div>
      <h1 className="mb-1 text-2xl">Asignaciones académicas</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Qué materia, nivel y paralelos atiende cada docente — la base de la que sale su horario de
        tutoría (sección &ldquo;Disponibilidad&rdquo;).
      </p>

      <div className="mb-4">
        <Input placeholder="Buscar por docente, materia o nivel…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {actionError && (
        <div className="mb-4 rounded-md bg-status-danger-tint px-3 py-2 text-sm text-status-danger">{actionError}</div>
      )}
      {error && <ErrorState title="No se pudieron cargar las asignaciones" />}
      {!error && !assignments && <Spinner />}
      {!error && assignments && filtered.length === 0 && (
        <EmptyState title="No se encontraron asignaciones con ese criterio." />
      )}
      {!error && filtered.length > 0 && (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-white font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-line">
                <th className="px-4 py-2 text-left">Docente</th>
                <th className="px-4 py-2 text-left">Materia</th>
                <th className="px-4 py-2 text-left">Nivel</th>
                <th className="px-4 py-2 text-left">Paralelos</th>
                <th className="px-4 py-2 text-left">Período</th>
                <th className="px-4 py-2 text-left">Estado</th>
                <th className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pg.pageItems.map((a) => {
                const levelParallels = [...(levels.find((l) => l.id === a.levelId)?.parallels ?? [])].sort((x, y) =>
                  x.name.localeCompare(y.name, 'es', { numeric: true }),
                );
                const isEditing = editing?.id === a.id ? editing : null;
                return (
                  <Fragment key={a.id}>
                    <tr className="hover:bg-paper">
                      <td className="px-4 py-2">
                        <Link href={`/docentes/${a.teacherId}`} className="font-medium text-accent-ink">
                          {a.teacher ? fullName(a.teacher) : '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{a.subject?.name}</td>
                      <td className="px-4 py-2">{a.level?.name}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {a.parallels?.length ? a.parallels.map((p) => p.parallel?.name).join(', ') : 'Todos'}
                      </td>
                      <td className="px-4 py-2 text-ink-soft">{a.academicPeriod?.name ?? '—'}</td>
                      <td className="px-4 py-2">
                        <button onClick={() => toggle(a)} title="Activar / desactivar">
                          <Badge tone={a.isActive ? 'accent' : 'neutral'}>{a.isActive ? 'Vigente' : 'Inactiva'}</Badge>
                        </button>
                      </td>
                      <td className="px-4 py-2">
                        <span className="flex items-center justify-end gap-3">
                          {levelParallels.length > 0 && (
                            <button
                              onClick={() =>
                                setEditing(
                                  isEditing ? null : { id: a.id, parallelIds: (a.parallels ?? []).map((p) => p.parallelId) },
                                )
                              }
                              title="Editar paralelos"
                              aria-label="Editar paralelos"
                              className="text-accent-ink hover:opacity-70"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => remove(a)}
                            title="Quitar materia"
                            aria-label="Quitar materia"
                            className="text-status-danger hover:opacity-70"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </span>
                      </td>
                    </tr>
                    {isEditing && (
                      <tr className="bg-paper">
                        <td colSpan={7} className="px-4 py-2">
                          <span className="text-xs text-ink-soft">Paralelos donde dicta la materia (ninguno = todo el nivel)</span>
                          <div className="flex flex-wrap items-center gap-3 py-2">
                            {levelParallels.map((p) => (
                              <label key={p.id} className="flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-[#1f6f5c]"
                                  checked={isEditing.parallelIds.includes(p.id)}
                                  onChange={(e) =>
                                    setEditing({
                                      id: a.id,
                                      parallelIds: e.target.checked
                                        ? [...isEditing.parallelIds, p.id]
                                        : isEditing.parallelIds.filter((x) => x !== p.id),
                                    })
                                  }
                                />
                                {p.name}
                              </label>
                            ))}
                            <Button onClick={saveParallels}>Guardar</Button>
                            <Button variant="secondary" onClick={() => setEditing(null)}>
                              Cancelar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination {...pg} />
    </div>
  );
}
