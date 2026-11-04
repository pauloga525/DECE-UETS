'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { AcademicPeriod, Level, Subject, Teacher, TeacherAssignment } from '@/lib/types';
import { fullName } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';
import { PencilIcon, TrashIcon } from '@/components/ui/icons';
import { Pagination, usePagination } from '@/components/ui/Pagination';

/** Formulario de crear/editar: id null = asignación nueva. */
interface Draft {
  id: string | null;
  teacherId: string;
  subjectId: string;
  levelId: string;
  parallelIds: string[];
  /** Valores originales, para avisar si se reasigna docente/materia/curso. */
  original?: { teacherId: string; subjectId: string; levelId: string };
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es', { numeric: true });

/**
 * CRUD de asignaciones docente · materia · curso · paralelos (pedido 2026-11-04). Admin y DECE
 * crean, editan (incluso reasignan a otro docente, materia o curso), activan/desactivan y quitan.
 * "Paralelos sin docente" muestra, por cada materia y curso ya cargados, los paralelos que nadie
 * dicta todavía.
 */
export default function TeacherAssignmentsOverviewPage() {
  useRequireAuth(['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST']);
  const [assignments, setAssignments] = useState<TeacherAssignment[] | null>(null);
  const [levels, setLevels] = useState<Level[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'list' | 'missing'>('list');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api
      .get<TeacherAssignment[]>('/teachers/assignments/list')
      .then(setAssignments)
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    load();
    api.get<Level[]>('/academic/levels').then(setLevels).catch(() => setLevels([]));
    api.get<Subject[]>('/academic/subjects').then(setSubjects).catch(() => setSubjects([]));
    api.get<Teacher[]>('/teachers').then(setTeachers).catch(() => setTeachers([]));
    api.get<AcademicPeriod[]>('/academic/periods').then(setPeriods).catch(() => setPeriods([]));
  }, [load]);

  const activePeriod = periods.find((p) => p.isActive);
  const levelById = useMemo(() => new Map(levels.map((l) => [l.id, l])), [levels]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (assignments ?? []).filter(
      (a) =>
        !q ||
        `${a.teacher ? fullName(a.teacher) : ''} ${a.subject?.name ?? ''} ${a.level?.name ?? ''}`.toLowerCase().includes(q),
    );
  }, [assignments, search]);

  // Por materia+curso: quién dicta cada paralelo (asignaciones vigentes). Sin paralelos = todo el curso.
  const coverage = useMemo(() => {
    const map = new Map<string, { subjectId: string; levelId: string; byParallel: Map<string, string[]>; whole: string[] }>();
    for (const a of assignments ?? []) {
      if (!a.isActive) continue;
      const key = `${a.subjectId}|${a.levelId}`;
      const entry = map.get(key) ?? {
        subjectId: a.subjectId,
        levelId: a.levelId,
        byParallel: new Map<string, string[]>(),
        whole: [] as string[],
      };
      const who = a.teacher ? fullName(a.teacher) : '—';
      if (!a.parallels?.length) entry.whole.push(who);
      for (const p of a.parallels ?? []) entry.byParallel.set(p.parallelId, [...(entry.byParallel.get(p.parallelId) ?? []), who]);
      map.set(key, entry);
    }
    return map;
  }, [assignments]);

  const missing = useMemo(() => {
    const rows: { subjectId: string; levelId: string; subject: string; level: string; parallels: { id: string; name: string }[] }[] = [];
    for (const c of coverage.values()) {
      if (c.whole.length) continue;
      const level = levelById.get(c.levelId);
      const free = [...(level?.parallels ?? [])].filter((p) => !c.byParallel.has(p.id)).sort(byName);
      if (!free.length) continue;
      rows.push({
        subjectId: c.subjectId,
        levelId: c.levelId,
        subject: subjects.find((s) => s.id === c.subjectId)?.name ?? '—',
        level: level?.name ?? '—',
        parallels: free,
      });
    }
    const q = search.toLowerCase();
    return rows
      .filter((r) => !q || `${r.subject} ${r.level}`.toLowerCase().includes(q))
      .sort((a, b) => a.level.localeCompare(b.level, 'es', { numeric: true }) || a.subject.localeCompare(b.subject, 'es'));
  }, [coverage, levelById, subjects, search]);

  async function run(action: () => Promise<unknown>, fallback: string, done?: string) {
    setActionError(null);
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : fallback);
    }
  }

  const toggle = (a: TeacherAssignment) =>
    run(() => api.patch(`/teachers/assignments/${a.id}`, { isActive: !a.isActive }), 'No se pudo actualizar la asignación');

  function remove(a: TeacherAssignment) {
    const who = a.teacher ? fullName(a.teacher) : 'este docente';
    if (!window.confirm(`¿Quitar ${a.subject?.name} · ${a.level?.name} a ${who}? Se borran también sus horarios de tutoría.`)) return;
    run(() => api.delete(`/teachers/assignments/${a.id}`), 'No se pudo quitar la asignación', 'Asignación eliminada.');
  }

  function openNew(prefill?: Partial<Draft>) {
    setDraftError(null);
    setDraft({ id: null, teacherId: '', subjectId: '', levelId: '', parallelIds: [], ...prefill });
  }

  function openEdit(a: TeacherAssignment) {
    setDraftError(null);
    setDraft({
      id: a.id,
      teacherId: a.teacherId,
      subjectId: a.subjectId,
      levelId: a.levelId,
      parallelIds: (a.parallels ?? []).map((p) => p.parallelId),
      original: { teacherId: a.teacherId, subjectId: a.subjectId, levelId: a.levelId },
    });
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setDraftError(null);
    try {
      if (draft.id) {
        await api.patch(`/teachers/assignments/${draft.id}`, {
          teacherId: draft.teacherId,
          subjectId: draft.subjectId,
          levelId: draft.levelId,
          parallelIds: draft.parallelIds,
        });
      } else {
        if (!activePeriod) throw new Error('No hay un período académico activo.');
        await api.post('/teachers/assignments', {
          teacherId: draft.teacherId,
          subjectId: draft.subjectId,
          levelId: draft.levelId,
          academicPeriodId: activePeriod.id,
          parallelIds: draft.parallelIds,
        });
      }
      setNotice(draft.id ? 'Asignación actualizada.' : 'Asignación creada.');
      setDraft(null);
      load();
    } catch (err) {
      setDraftError(err instanceof ApiError || err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  const pg = usePagination(filtered);
  const pgMissing = usePagination(missing);

  // Datos del formulario
  const draftLevel = draft ? levelById.get(draft.levelId) : undefined;
  const draftParallels = [...(draftLevel?.parallels ?? [])].sort(byName);
  const draftCoverage = draft ? coverage.get(`${draft.subjectId}|${draft.levelId}`) : undefined;
  const draftTeacherName = draft ? teachers.find((t) => t.id === draft.teacherId) : undefined;
  const reassigns =
    !!draft?.original &&
    (draft.original.teacherId !== draft.teacherId ||
      draft.original.subjectId !== draft.subjectId ||
      draft.original.levelId !== draft.levelId);
  // Quién más dicta un paralelo (excluye a la propia asignación que se edita).
  const othersFor = (parallelId: string) => {
    const self = draft?.id ? assignments?.find((a) => a.id === draft.id) : undefined;
    const selfName = self?.teacher ? fullName(self.teacher) : null;
    const names = [...(draftCoverage?.byParallel.get(parallelId) ?? []), ...(draftCoverage?.whole ?? [])];
    const idx = selfName && !reassigns ? names.indexOf(selfName) : -1;
    if (idx >= 0) names.splice(idx, 1);
    return names;
  };

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Asignaciones académicas</h1>
        <Button onClick={() => openNew()} disabled={!activePeriod}>
          Nueva asignación
        </Button>
      </div>
      <p className="mb-6 text-sm text-ink-soft">
        Qué materia, curso y paralelos atiende cada docente — la base de la que sale su horario de
        tutoría (sección &ldquo;Disponibilidad&rdquo;).
      </p>

      <div className="mb-4 flex gap-2 border-b border-line">
        {(
          [
            ['list', 'Asignaciones'],
            ['missing', `Paralelos sin docente${assignments ? ` (${missing.length})` : ''}`],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t ? 'border-accent font-medium text-accent-ink' : 'border-transparent text-ink-soft'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <Input
          placeholder={tab === 'list' ? 'Buscar por docente, materia o curso…' : 'Buscar por materia o curso…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {actionError && (
        <div className="mb-4 rounded-md bg-status-danger-tint px-3 py-2 text-sm text-status-danger">{actionError}</div>
      )}
      {notice && <div className="mb-4 rounded-md bg-accent-tint px-3 py-2 text-sm text-accent-ink">{notice}</div>}
      {error && <ErrorState title="No se pudieron cargar las asignaciones" />}
      {!error && !assignments && <Spinner />}

      {tab === 'list' && !error && assignments && filtered.length === 0 && (
        <EmptyState title="No se encontraron asignaciones con ese criterio." />
      )}
      {tab === 'list' && !error && filtered.length > 0 && (
        <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2 text-left">Docente</th>
                    <th className="px-4 py-2 text-left">Materia</th>
                    <th className="px-4 py-2 text-left">Curso</th>
                    <th className="px-4 py-2 text-left">Paralelos</th>
                    <th className="px-4 py-2 text-left">Período</th>
                    <th className="px-4 py-2 text-left">Estado</th>
                    <th className="px-4 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pg.pageItems.map((a) => (
                    <tr key={a.id} className="hover:bg-paper">
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
                          <button
                            onClick={() => openEdit(a)}
                            title="Editar asignación"
                            aria-label="Editar asignación"
                            className="text-accent-ink hover:opacity-70"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => remove(a)}
                            title="Quitar asignación"
                            aria-label="Quitar asignación"
                            className="text-status-danger hover:opacity-70"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination {...pg} />
        </>
      )}

      {tab === 'missing' && !error && assignments && (
        <>
          <p className="mb-3 text-xs text-ink-soft">
            Por cada materia y curso ya cargados, los paralelos que todavía no tiene ningún docente (asignaciones vigentes).
          </p>
          {missing.length === 0 ? (
            <EmptyState title="Todos los paralelos de las materias cargadas tienen docente." />
          ) : (
            <>
              <Card>
                <ul className="divide-y divide-line">
                  {pgMissing.pageItems.map((m) => (
                    <li key={`${m.subjectId}|${m.levelId}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span>
                        <span className="font-medium">{m.subject}</span> · {m.level}
                        <span className="ml-2 font-mono text-xs text-status-warning">
                          sin docente: {m.parallels.map((p) => p.name).join(', ')}
                        </span>
                      </span>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          openNew({ subjectId: m.subjectId, levelId: m.levelId, parallelIds: m.parallels.map((p) => p.id) })
                        }
                      >
                        Asignar
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card>
              <Pagination {...pgMissing} />
            </>
          )}
        </>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Editar asignación' : 'Nueva asignación'}
      >
        {draft && (
          <div className="flex flex-col gap-3">
            <Select label="Docente" value={draft.teacherId} onChange={(e) => setDraft({ ...draft, teacherId: e.target.value })}>
              <option value="">Selecciona</option>
              {teachers
                .filter((t) => t.isActive || t.id === draft.teacherId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {fullName(t)}
                  </option>
                ))}
            </Select>
            <Select label="Materia" value={draft.subjectId} onChange={(e) => setDraft({ ...draft, subjectId: e.target.value })}>
              <option value="">Selecciona</option>
              {subjects
                .filter((s) => s.isActive || s.id === draft.subjectId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
            <Select
              label="Curso"
              value={draft.levelId}
              onChange={(e) => setDraft({ ...draft, levelId: e.target.value, parallelIds: [] })}
            >
              <option value="">Selecciona</option>
              {[...levels].sort((a, b) => a.order - b.order).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>

            {draftParallels.length > 0 && (
              <fieldset className="text-sm">
                <legend className="mb-1 text-xs text-ink-soft">Paralelos donde dicta la materia (ninguno = todo el curso)</legend>
                <div className="flex flex-col gap-1.5 py-1">
                  {draftParallels.map((p) => {
                    const others = draft.subjectId ? othersFor(p.id) : [];
                    return (
                      <label key={p.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#1f6f5c]"
                          checked={draft.parallelIds.includes(p.id)}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              parallelIds: e.target.checked
                                ? [...draft.parallelIds, p.id]
                                : draft.parallelIds.filter((x) => x !== p.id),
                            })
                          }
                        />
                        <span className="font-mono">{p.name}</span>
                        {others.length > 0 ? (
                          <span className="text-xs text-ink-soft">también lo dicta: {others.join(', ')}</span>
                        ) : (
                          draft.subjectId && <span className="text-xs text-status-warning">sin docente</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {reassigns && (
              <p className="rounded-md bg-status-warning-tint px-3 py-2 text-xs text-status-warning">
                Cambias el docente, la materia o el curso: se borran los horarios de tutoría declarados para esta
                asignación{draftTeacherName ? ` y ${fullName(draftTeacherName)} deberá declarar los suyos` : ''}. Si ya
                tiene tutorías registradas no se permite: quítale los paralelos o desactívala y crea una nueva.
              </p>
            )}
            {draftError && <p className="text-sm text-status-danger">{draftError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
              <Button disabled={saving || !draft.teacherId || !draft.subjectId || !draft.levelId} onClick={saveDraft}>
                {saving ? 'Guardando…' : draft.id ? 'Guardar cambios' : 'Crear asignación'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
