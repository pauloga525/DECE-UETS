'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { TutoringSession } from '@/lib/types';
import { todayInputValue } from '@/lib/format';
import { Card, CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/EmptyState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

import { Pagination, usePagination } from '@/components/ui/Pagination';
export default function DashboardPage() {
  const { user } = useAuth();
  const canCreate = user && ['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST', 'TEACHER'].includes(user.role);
  const [sessions, setSessions] = useState<TutoringSession[] | null>(null);
  const [error, setError] = useState(false);

  const router = useRouter();

  useEffect(() => {
    // El animador no tiene agenda: su inicio es el listado de su curso.
    if (!user) return;
    if (user.role === 'ANIMATOR') {
      router.replace('/animador');
      return;
    }
    api
      .get<TutoringSession[]>(`/tutoring/sessions?date=${todayInputValue()}`)
      .then(setSessions)
      .catch(() => setError(true));
  }, [user, router]);

  const today = sessions ?? [];
  const scheduledOrLater = today.filter((s) => s.status !== 'AVAILABLE' && s.status !== 'CANCELLED');
  const studentsAttended = scheduledOrLater.reduce(
    (acc, s) => acc + (s.enrollments?.filter((e) => e.status === 'ATTENDED').length ?? 0),
    0,
  );
  const freeSlots = today.filter((s) => s.status === 'AVAILABLE').length;
  const absences = scheduledOrLater.reduce(
    (acc, s) => acc + (s.enrollments?.filter((e) => e.status === 'ABSENT').length ?? 0),
    0,
  );

  const kpis = [
    { label: 'Tutorías hoy', value: scheduledOrLater.length },
    { label: 'Estudiantes atendidos', value: studentsAttended },
    { label: 'Cupos libres hoy', value: freeSlots },
    { label: 'Inasistencias hoy', value: absences },
  ];

  const pg = usePagination(today, 10);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl">Inicio</h1>
          <p className="text-sm text-ink-soft">
            Hola{user ? `, ${user.fullName?.split(' ')[0] ?? user.email.split('@')[0]}` : ''} — así va el día de hoy.
          </p>
        </div>
        <Link href="/agenda">
          <Button variant="secondary">Ver agenda completa</Button>
        </Link>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardBody>
              <div className="font-mono text-2xl font-medium text-ink">{kpi.value}</div>
              <div className="text-xs text-ink-soft">{kpi.label}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 text-lg">Agenda de hoy</h2>
      {error && <EmptyState title="No se pudo cargar la agenda de hoy." />}
      {!error && !sessions && <Spinner />}
      {!error && sessions && sessions.length === 0 && (
        <EmptyState
          title="No hay tutorías programadas para hoy."
          action={
            canCreate && (
              <Link href="/crear">
                <Button>Crear tutoría</Button>
              </Link>
            )
          }
        />
      )}
      {!error && sessions && sessions.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {pg.pageItems.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sesiones/${s.id}`}
                  className="flex items-center justify-between px-5 py-3 text-sm hover:bg-paper"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-ink-soft">{s.startTime}</span>
                    <span>
                      {s.teacher ? `${s.teacher.firstName} ${s.teacher.lastName}` : '—'}
                      {s.subject ? ` · ${s.subject.name}` : ''}
                      {s.level ? ` · ${s.level.name}` : ''}
                    </span>
                  </div>
                  <StatusBadge status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination {...pg} />
    </div>
  );
}
