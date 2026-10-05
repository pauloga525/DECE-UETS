'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { SessionStatus, Teacher, TutoringSession } from '@/lib/types';
import { SESSION_STATUS_LABEL } from '@/lib/types';
import { fullName, formatDate } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { TutoringCalendar } from '@/components/TutoringCalendar';
import { useAuth } from '@/lib/auth';

const STATUS_FILTERS: SessionStatus[] = ['AVAILABLE', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
const PAGE_SIZE = 20;

// El filtro de fecha parte vacío (sin acotar a "hoy") — el de estado es el que manda
// para acotar la vista; la fecha queda como filtro opcional adicional.
const STATUS_PRIORITY: Record<SessionStatus, number> = {
  IN_PROGRESS: 0,
  AVAILABLE: 1,
  SCHEDULED: 2,
  COMPLETED: 3,
  CANCELLED: 4,
};

export default function AgendaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = (searchParams.get('status') as SessionStatus | null) ?? '';

  const [date, setDate] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [sessions, setSessions] = useState<TutoringSession[] | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const { user } = useAuth();
  const isTeacher = user?.role === 'TEACHER';
  // Vista tipo Google Calendar por defecto (pedido 7/9/2026); la lista queda como alternativa.
  const [view, setView] = useState<'calendar' | 'list'>('calendar');

  useEffect(() => {
    if (user && !isTeacher) api.get<Teacher[]>('/teachers').then(setTeachers).catch(() => {});
  }, [user, isTeacher]);

  function load() {
    setSessions(null);
    setError(false);
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (teacherId) params.set('teacherId', teacherId);
    if (statusParam) params.set('status', statusParam);
    api
      .get<TutoringSession[]>(`/tutoring/sessions?${params.toString()}`)
      .then(setSessions)
      .catch(() => setError(true));
  }

  useEffect(() => {
    if (view === 'list') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, teacherId, statusParam, view]);
  useEffect(() => setPage(0), [date, teacherId, statusParam]);

  function setStatusFilter(status: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (status) params.set('status', status);
    else params.delete('status');
    router.push(`/agenda?${params.toString()}`);
  }

  const sorted = useMemo(() => {
    if (!sessions) return [];
    return sessions.slice().sort((a, b) => {
      if (statusParam) {
        return a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date);
      }
      const priorityDiff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      return a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date);
    });
  }, [sessions, statusParam]);

  const pageItems = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">{isTeacher ? 'Mi agenda de tutorías' : 'Agenda de tutorías'}</h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-line bg-white p-0.5 text-sm" role="tablist">
            {(['calendar', 'list'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`rounded px-3 py-1 ${view === v ? 'bg-accent-tint font-medium text-accent-ink' : 'text-ink-soft hover:text-ink'}`}
              >
                {v === 'calendar' ? 'Calendario' : 'Lista'}
              </button>
            ))}
          </div>
          <Link href="/crear">
            <Button>Crear tutoría</Button>
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        {view === 'list' && <Input type="date" label="Fecha" value={date} onChange={(e) => setDate(e.target.value)} />}
        {!isTeacher && (
          <Select label="Docente" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">Todos</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {fullName(t)}
              </option>
            ))}
          </Select>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Estado</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setStatusFilter('')}
              className={`rounded-full border px-3 py-1 text-xs ${!statusParam ? 'border-accent bg-accent-tint text-accent-ink' : 'border-line text-ink-soft'}`}
            >
              Todos
            </button>
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-3 py-1 text-xs ${statusParam === s ? 'border-accent bg-accent-tint text-accent-ink' : 'border-line text-ink-soft'}`}
              >
                {SESSION_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'calendar' && <TutoringCalendar teacherId={teacherId} status={statusParam} />}

      {view === 'list' && error && <ErrorState title="No se pudo cargar la agenda" onRetry={load} />}
      {view === 'list' && !error && !sessions && <Spinner />}
      {view === 'list' && !error && sessions && sessions.length === 0 && (
        <EmptyState title="No hay tutorías ni disponibilidad registrada." />
      )}
      {view === 'list' && !error && sessions && sessions.length > 0 && (
        <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2 text-left">Fecha</th>
                    <th className="px-4 py-2 text-left">Hora</th>
                    <th className="px-4 py-2 text-left">Docente</th>
                    <th className="px-4 py-2 text-left">Materia · Nivel</th>
                    <th className="px-4 py-2 text-left">Cupo</th>
                    <th className="px-4 py-2 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pageItems.map((s) => {
                    const href =
                      s.status === 'AVAILABLE' ? `/crear?sessionId=${s.id}` : `/sesiones/${s.id}`;
                    return (
                      <tr key={s.id} className="hover:bg-paper">
                        <td className="px-4 py-2">
                          <Link href={href} className="block text-xs capitalize text-ink-soft">
                            {formatDate(s.date)}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          <Link href={href} className="block font-mono">
                            {s.startTime}–{s.endTime}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          <Link href={href} className="block">
                            {s.teacher ? fullName(s.teacher) : '—'}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          <Link href={href} className="block text-ink-soft">
                            {s.subject?.name} · {s.level?.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2 font-mono">
                          {(s.enrollments?.length ?? 0)}/{s.capacity}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={s.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="mt-3 flex items-center justify-between text-sm text-ink-soft">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE + PAGE_SIZE, sorted.length)} de {sorted.length}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
