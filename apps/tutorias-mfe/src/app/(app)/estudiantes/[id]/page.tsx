'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { GuardiansCard } from '@/components/GuardiansCard';
import type { Student, TutoringEnrollment } from '@/lib/types';
import { ENROLLMENT_REASON_LABEL } from '@/lib/types';
import { fullName } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';

import { Pagination, usePagination } from '@/components/ui/Pagination';
export default function StudentHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canSeeGuardians = !!user && ['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST'].includes(user.role);
  const [student, setStudent] = useState<Student | null>(null);
  const [history, setHistory] = useState<TutoringEnrollment[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get<Student>(`/students/${id}`).then(setStudent).catch(() => setError(true));
    api
      .get<TutoringEnrollment[]>(`/students/${id}/history`)
      .then(setHistory)
      .catch(() => setError(true));
  }, [id]);

  const pg = usePagination(history ?? [], 10);
  if (error) return <ErrorState title="No se pudo cargar el historial" />;
  if (!student || !history) return <Spinner />;

  const completed = history.filter((h) => h.tutoringSession?.status === 'COMPLETED');
  const attended = history.filter((h) => h.attendance?.status === 'PRESENT').length;
  const absent = history.filter((h) => h.attendance?.status === 'ABSENT').length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/estudiantes" className="mb-4 inline-block text-sm text-ink-soft hover:text-ink">
        ← Estudiantes
      </Link>
      <h1 className="mb-1 text-2xl">{fullName(student)}</h1>
      <p className="mb-6 font-mono text-sm text-ink-soft">
        {student.identification} · {student.level?.name} · Paralelo {student.parallel?.name}
      </p>

      <div className="mb-8 grid grid-cols-3 gap-4">
        <Card>
          <div className="p-4">
            <div className="font-mono text-2xl">{completed.length}</div>
            <div className="text-xs text-ink-soft">Tutorías realizadas</div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="font-mono text-2xl">{attended}</div>
            <div className="text-xs text-ink-soft">Asistencias</div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="font-mono text-2xl">{absent}</div>
            <div className="text-xs text-ink-soft">Inasistencias</div>
          </div>
        </Card>
      </div>

      {canSeeGuardians && <GuardiansCard studentId={id} />}

      <h2 className="mb-3 text-lg">Línea de tiempo</h2>
      {history.length === 0 && <EmptyState title="Este estudiante no tiene tutorías registradas todavía." />}
      {history.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {pg.pageItems.map((h) => (
              <li key={h.id}>
                <Link href={`/sesiones/${h.tutoringSessionId}`} className="block px-5 py-3 hover:bg-paper">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {h.tutoringSession?.subject?.name} · {h.tutoringSession?.level?.name}
                    </span>
                    <span className="font-mono text-xs text-ink-soft">
                      {h.tutoringSession?.date.slice(0, 10)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-ink-soft">
                    <span>{h.tutoringSession?.teacher ? fullName(h.tutoringSession.teacher) : ''}</span>
                    <span>· {ENROLLMENT_REASON_LABEL[h.reason]}</span>
                    {h.attendance && (
                      <Badge tone={h.attendance.status === 'PRESENT' ? 'accent' : 'danger'}>
                        {h.attendance.status}
                      </Badge>
                    )}
                  </div>
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
