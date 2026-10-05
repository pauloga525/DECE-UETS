'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { ANIMATOR_CAPABLE } from '@/lib/animator';
import type { Student, TutoringEnrollment } from '@/lib/types';
import { ENROLLMENT_REASON_LABEL } from '@/lib/types';
import { fullName } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';

const STATUS: Record<string, { label: string; tone: 'accent' | 'danger' | 'neutral' | 'waitlist' }> = {
  ATTENDED: { label: 'Asistió', tone: 'accent' },
  ABSENT: { label: 'Faltó', tone: 'danger' },
  JUSTIFIED: { label: 'Justificada', tone: 'waitlist' },
  ENROLLED: { label: 'Programada', tone: 'neutral' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
};

/** Historial de tutorías de un alumno del curso del animador. */
export default function AnimatorStudentHistoryPage() {
  useRequireAuth(ANIMATOR_CAPABLE);
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ student: Student; history: TutoringEnrollment[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ student: Student; history: TutoringEnrollment[] }>(`/animator/students/${id}/history`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar el historial'));
  }, [id]);

  if (error) return <ErrorState title={error} />;
  if (!data) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/animador" className="mb-4 inline-block text-sm text-ink-soft hover:text-ink">
        ← Alumnos con tutorías
      </Link>
      <h1 className="mb-1 text-2xl">{fullName(data.student)}</h1>
      <p className="mb-6 text-sm text-ink-soft">
        {data.student.level?.name} &ldquo;{data.student.parallel?.name}&rdquo; · {data.student.identification}
      </p>

      {data.history.length === 0 ? (
        <EmptyState title="Sin tutorías registradas." />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {data.history.map((h) => {
              const s = h.tutoringSession;
              const st = STATUS[h.status] ?? STATUS.ENROLLED;
              return (
                <li key={h.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {s?.subject?.name} · {s?.teacher ? fullName(s.teacher) : ''}
                      </div>
                      <div className="font-mono text-xs text-ink-soft">
                        {s?.date.slice(0, 10)} · {s?.startTime}–{s?.endTime}
                        {s?.location ? ` · ${s.location}` : ''}
                      </div>
                      <div className="text-xs text-ink-soft">Motivo: {ENROLLMENT_REASON_LABEL[h.reason]}</div>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  {s?.report && (
                    <div className="mt-2 rounded-md bg-paper px-3 py-2 text-xs text-ink">
                      <div>
                        <span className="text-ink-soft">Destrezas:</span> {s.report.skills}
                      </div>
                      {s.report.tasks && (
                        <div>
                          <span className="text-ink-soft">Tareas:</span> {s.report.tasks}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
