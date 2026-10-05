'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { ANIMATOR_CAPABLE, courseLabel, useAnimatorCourses } from '@/lib/animator';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';

interface CourseStudent {
  id: string;
  firstName: string;
  lastName: string;
  identification: string;
  total: number;
  attended: number;
  absent: number;
  justified: number;
  pending: number;
  subjects: string[];
  lastDate: string | null;
}

interface Upcoming {
  id: string;
  student: { id: string; firstName: string; lastName: string };
  tutoringSession: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    status: 'SCHEDULED' | 'IN_PROGRESS';
    location: string | null;
    subject: { name: string };
    teacher: { firstName: string; lastName: string };
  };
}

type Filter = 'all' | 'with' | 'pending' | 'absent' | 'none';
const FILTERS: { key: Filter; label: string; test: (s: CourseStudent) => boolean }[] = [
  { key: 'all', label: 'Todos', test: () => true },
  { key: 'with', label: 'Con tutorías', test: (s) => s.total > 0 },
  { key: 'pending', label: 'Con pendientes', test: (s) => s.pending > 0 },
  { key: 'absent', label: 'Con faltas', test: (s) => s.absent > 0 },
  { key: 'none', label: 'Sin tutorías', test: (s) => s.total === 0 },
];

/**
 * Animador: TODOS los alumnos de su curso con su resumen de tutorías — pendientes,
 * asistencias y faltas — y la lista de tutorías pendientes (pedidos 2026-09-30 y 2026-10-05).
 * Solo consulta: como animador no crea tutorías; las crea cada docente para su materia.
 */
export default function AnimatorStudentsPage() {
  useRequireAuth(ANIMATOR_CAPABLE);
  const { courses, error: coursesError } = useAnimatorCourses();
  const [parallelId, setParallelId] = useState('');
  const [students, setStudents] = useState<CourseStudent[] | null>(null);
  const [upcoming, setUpcoming] = useState<Upcoming[] | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [tab, setTab] = useState<'alumnos' | 'pendientes'>('alumnos');

  useEffect(() => {
    if (courses?.length && !parallelId) setParallelId(courses[0].id);
  }, [courses, parallelId]);

  useEffect(() => {
    if (!parallelId) return;
    setStudents(null);
    setUpcoming(null);
    setError(false);
    Promise.all([
      api.get<{ students: CourseStudent[] }>(`/animator/students?parallelId=${parallelId}`),
      api.get<Upcoming[]>(`/animator/upcoming?parallelId=${parallelId}`),
    ])
      .then(([r, u]) => {
        setStudents(r.students);
        setUpcoming(u);
      })
      .catch(() => setError(true));
  }, [parallelId]);

  const totals = useMemo(() => {
    const list = students ?? [];
    const sum = (f: (s: CourseStudent) => number) => list.reduce((n, s) => n + f(s), 0);
    const held = sum((s) => s.attended + s.absent + s.justified);
    return {
      students: list.length,
      withTutoring: list.filter((s) => s.total > 0).length,
      pending: sum((s) => s.pending),
      attended: sum((s) => s.attended),
      absent: sum((s) => s.absent),
      rate: held ? Math.round((sum((s) => s.attended) / held) * 100) : null,
    };
  }, [students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const test = FILTERS.find((f) => f.key === filter)!.test;
    return (students ?? []).filter(
      (s) => test(s) && (!q || `${s.firstName} ${s.lastName} ${s.identification}`.toLowerCase().includes(q)),
    );
  }, [students, search, filter]);

  if (coursesError) return <ErrorState title={coursesError} />;
  if (!courses) return <Spinner />;
  if (courses.length === 0) {
    return <EmptyState title="No tienes un curso asignado como animador. Pide al administrador que te asigne a un paralelo." />;
  }
  const current = courses.find((c) => c.id === parallelId);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Alumnos de mi curso</h1>
          <p className="text-sm text-ink-soft">
            {current ? courseLabel(current) : ''} · como animador, solo consulta: las tutorías las crea cada docente
            para su materia.
          </p>
        </div>
        <div className="flex items-end gap-3">
          {courses.length > 1 && (
            <Select label="Curso" value={parallelId} onChange={(e) => setParallelId(e.target.value)}>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {courseLabel(c)}
                </option>
              ))}
            </Select>
          )}
          <Link
            href={`/animador/reporte?parallelId=${parallelId}`}
            className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium hover:border-accent"
          >
            Reporte del curso
          </Link>
        </div>
      </div>

      {error && <ErrorState title="No se pudo cargar la información del curso." />}
      {!error && !students && <Spinner />}

      {students && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Alumnos" value={totals.students} />
            <Kpi label="Con tutorías" value={totals.withTutoring} />
            <Kpi label="Tutorías pendientes" value={totals.pending} tone={totals.pending ? 'warning' : undefined} />
            <Kpi label="Asistencias" value={totals.attended} tone="accent" />
            <Kpi label="Faltas" value={totals.absent} tone={totals.absent ? 'danger' : undefined} />
            <Kpi label="% asistencia" value={totals.rate === null ? '—' : `${totals.rate}%`} />
          </div>

          <div className="mb-4 flex gap-1 border-b border-line">
            {(
              [
                ['alumnos', `Alumnos (${students.length})`],
                ['pendientes', `Tutorías pendientes (${upcoming?.length ?? 0})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                  tab === key ? 'border-accent text-accent-ink' : 'border-transparent text-ink-soft hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'alumnos' && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="w-full max-w-sm">
                  <Input placeholder="Buscar alumno…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        filter === f.key ? 'border-accent bg-accent-tint text-accent-ink' : 'border-line text-ink-soft hover:border-accent'
                      }`}
                    >
                      {f.label} ({students.filter(f.test).length})
                    </button>
                  ))}
                </div>
              </div>
              {filtered.length === 0 && <EmptyState title="Ningún alumno coincide con el filtro." />}
              {filtered.length > 0 && (
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                          <th className="px-4 py-2">Alumno</th>
                          <th className="px-4 py-2">Materias</th>
                          <th className="px-4 py-2 text-center">Tutorías</th>
                          <th className="px-4 py-2 text-center">Pendientes</th>
                          <th className="px-4 py-2 text-center">Asistió</th>
                          <th className="px-4 py-2 text-center">Faltas</th>
                          <th className="px-4 py-2 text-center">Justif.</th>
                          <th className="px-4 py-2">Última</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {filtered.map((s) => (
                          <tr key={s.id} className="hover:bg-paper">
                            <td className="px-4 py-2">
                              <Link href={`/animador/estudiantes/${s.id}`} className="font-medium text-accent-ink">
                                {s.lastName} {s.firstName}
                              </Link>
                              <div className="font-mono text-xs text-ink-soft">{s.identification}</div>
                            </td>
                            <td className="px-4 py-2 text-ink-soft">{s.subjects.join(', ') || '—'}</td>
                            <td className="px-4 py-2 text-center font-mono">{s.total}</td>
                            <td className={`px-4 py-2 text-center font-mono ${s.pending ? 'font-medium text-status-warning' : ''}`}>
                              {s.pending}
                            </td>
                            <td className="px-4 py-2 text-center font-mono text-accent-ink">{s.attended}</td>
                            <td className={`px-4 py-2 text-center font-mono ${s.absent ? 'font-medium text-status-danger' : ''}`}>
                              {s.absent}
                            </td>
                            <td className="px-4 py-2 text-center font-mono">{s.justified}</td>
                            <td className="px-4 py-2 font-mono text-xs text-ink-soft">{s.lastDate?.slice(0, 10) ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          )}

          {tab === 'pendientes' &&
            (upcoming && upcoming.length > 0 ? (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                        <th className="px-4 py-2">Fecha</th>
                        <th className="px-4 py-2">Hora</th>
                        <th className="px-4 py-2">Alumno</th>
                        <th className="px-4 py-2">Materia</th>
                        <th className="px-4 py-2">Docente</th>
                        <th className="px-4 py-2">Lugar</th>
                        <th className="px-4 py-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {upcoming.map((u) => (
                        <tr key={u.id} className="hover:bg-paper">
                          <td className="px-4 py-2 font-mono text-xs">{u.tutoringSession.date.slice(0, 10)}</td>
                          <td className="px-4 py-2 font-mono text-xs">
                            {u.tutoringSession.startTime}–{u.tutoringSession.endTime}
                          </td>
                          <td className="px-4 py-2">
                            <Link href={`/animador/estudiantes/${u.student.id}`} className="font-medium text-accent-ink">
                              {u.student.lastName} {u.student.firstName}
                            </Link>
                          </td>
                          <td className="px-4 py-2">{u.tutoringSession.subject.name}</td>
                          <td className="px-4 py-2 text-ink-soft">
                            {u.tutoringSession.teacher.firstName} {u.tutoringSession.teacher.lastName}
                          </td>
                          <td className="px-4 py-2 text-ink-soft">{u.tutoringSession.location ?? '—'}</td>
                          <td className="px-4 py-2 text-xs">
                            {u.tutoringSession.status === 'IN_PROGRESS' ? 'En curso' : 'Programada'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <EmptyState title="No hay tutorías pendientes para los alumnos de tu curso." />
            ))}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'accent' | 'warning' | 'danger' }) {
  const color =
    tone === 'accent' ? 'text-accent-ink' : tone === 'warning' ? 'text-status-warning' : tone === 'danger' ? 'text-status-danger' : 'text-ink';
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className={`font-mono text-2xl font-medium ${color}`}>{value}</div>
    </div>
  );
}
