'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { AttendanceStatus, TutoringSession } from '@/lib/types';
import { Countdown } from '@/components/Countdown';
import { ReportForm, type ReportValues } from '@/components/ReportForm';
import { AttendanceChecklist } from '@/components/AttendanceChecklist';
import { Spinner, ErrorState } from '@/components/ui/EmptyState';


/**
 * Pantalla "Tutoría en curso" (pedidos 7/9/2026): cronómetro de 40 min con alarma, toma de
 * lista de los estudiantes asignados (se guarda al marcar) e informe de cierre.
 */
export default function TutoringInProgressPage() {
  useRequireAuth(['ADMIN', 'TEACHER']);
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [session, setSession] = useState<TutoringSession | null>(null);
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [timeUp, setTimeUp] = useState(false);

  const load = useCallback(() => {
    api
      .get<TutoringSession>(`/tutoring/sessions/${id}`)
      .then((s) => {
        setSession(s);
        const initial: Record<string, AttendanceStatus> = {};
        s.enrollments?.forEach((e) => {
          if (e.attendance?.status) initial[e.id] = e.attendance.status;
        });
        setAttendance(initial);
      })
      .catch(() => setLoadError('No se pudo cargar la tutoría'));
  }, [id]);

  useEffect(load, [load]);

  if (loadError && !session) return <ErrorState title={loadError} onRetry={load} />;
  if (!session) return <Spinner />;

  const roll = session.enrollments?.filter((e) => e.status !== 'CANCELLED') ?? [];
  // Informe pendiente: el sistema ya cerró la tutoría a los 40 min. La asistencia se corrige
  // localmente y viaja junto con el informe.
  const live = session.status === 'IN_PROGRESS';
  const pendingReport = session.status === 'COMPLETED' && !session.report;
  if (!live && !pendingReport) {
    return (
      <ErrorState
        title="Esta tutoría no está en curso ni tiene informe pendiente."
        onRetry={() => router.push(`/sesiones/${id}`)}
      />
    );
  }
  // Casilla marcada = asistió; sin marcar = ausente (pedido 2026-10-02).
  const present = new Set(roll.filter((e) => attendance[e.id] === 'PRESENT').map((e) => e.id));

  function onRollChange(next: Set<string>) {
    const changed = roll.filter((e) => next.has(e.id) !== present.has(e.id));
    for (const e of changed) void mark(e.id, next.has(e.id) ? 'PRESENT' : 'ABSENT');
  }

  // La lista se guarda en el servidor apenas se marca cada estudiante: si se cierra la
  // pestaña o el bloque vence, no se pierde lo registrado.
  async function mark(enrollmentId: string, status: AttendanceStatus) {
    const previous = attendance[enrollmentId];
    setAttendance((prev) => ({ ...prev, [enrollmentId]: status }));
    if (!live) return;
    setSaving(enrollmentId);
    setError(null);
    try {
      await api.post(`/tutoring/sessions/${id}/attendance`, { records: [{ enrollmentId, status }] });
    } catch (err) {
      setAttendance((prev) => ({ ...prev, [enrollmentId]: previous }));
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la asistencia');
    } finally {
      setSaving(null);
    }
  }

  async function finish(report: ReportValues) {
    setSubmitting(true);
    setError(null);
    const body = {
      // Marcados asistieron; el resto queda ausente — así viaja en el correo de cierre.
      presentEnrollmentIds: [...present],
      report: { skills: report.skills, observations: report.observations, tasks: report.tasks || undefined },
    };
    try {
      // Si el sistema ya la cerró al vencer los 40 min, el informe va como "pendiente".
      const current = await api.get<TutoringSession>(`/tutoring/sessions/${id}`);
      const endpoint = current.status === 'IN_PROGRESS' ? 'complete' : 'report';
      await api.post(`/tutoring/sessions/${id}/${endpoint}`, body);
      router.push(`/sesiones/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo finalizar la tutoría');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper px-4 py-8">
      <div className="mx-auto w-full max-w-2xl rounded-lg border border-line bg-white p-6 shadow-subtle">
        <div className="mb-6 flex flex-col items-center text-center">
          {pendingReport && (
            <div className="rounded-md bg-status-warning-tint px-4 py-2 text-sm text-status-warning">
              Tutoría cerrada automáticamente — informe pendiente. Revisa la asistencia (los no
              registrados quedaron como ausentes) y completa el informe.
            </div>
          )}
          {live && session.timing && (
            <Countdown
              startsAt={session.timing.startsAt}
              endsAt={session.timing.endsAt}
              serverNow={session.timing.serverNow}
              onFinish={() => setTimeUp(true)}
            />
          )}
          <h1 className="mt-4 text-xl">
            {session.subject?.name} · {session.level?.name}
          </h1>
          <p className="text-sm text-ink-soft">
            {session.startTime}–{session.endTime}
            {session.location ? ` · ${session.location}` : ''}
          </p>
        </div>

        {timeUp && (
          <div role="alert" className="mb-4 rounded-md bg-status-danger-tint px-3 py-2 text-center text-sm text-status-danger">
            Se cumplieron los 40 minutos. Revisa la asistencia y completa el informe para cerrar la tutoría.
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-md bg-status-danger-tint px-3 py-2 text-sm text-status-danger">{error}</div>
        )}

        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base">¿Quiénes asistieron?</h2>
            {saving && <span className="text-xs text-ink-soft">guardando…</span>}
          </div>
          <p className="mb-2 text-xs text-ink-soft">
            La lista que tomaste al iniciar; corrígela si alguien llegó tarde. Al finalizar se avisa a cada
            representante si su representado asistió o estuvo ausente.
          </p>
          <AttendanceChecklist enrollments={roll} present={present} onChange={onRollChange} disabled={submitting} />
        </section>

        <section>
          <h2 className="mb-3 text-base">Informe de cierre</h2>
          <div>
            <ReportForm
              submitting={submitting}
              submitLabel={live ? 'Finalizar tutoría' : 'Guardar informe'}
              onSubmit={finish}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
