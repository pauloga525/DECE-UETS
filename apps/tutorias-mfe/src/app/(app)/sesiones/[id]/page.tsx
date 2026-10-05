'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { EnrollmentReason, TutoringSession } from '@/lib/types';
import { ENROLLMENT_REASON_LABEL } from '@/lib/types';
import { fullName } from '@/lib/format';
import { unlockAlarm } from '@/lib/alarm';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { StudentPicker } from '@/components/StudentPicker';
import { AttendanceChecklist } from '@/components/AttendanceChecklist';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

export default function TutoringDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [session, setSession] = useState<TutoringSession | null>(null);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [startPresent, setStartPresent] = useState<Set<string>>(new Set());
  const [cancelReason, setCancelReason] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [reason, setReason] = useState<EnrollmentReason>('ACADEMIC_REINFORCEMENT');

  const load = useCallback(() => {
    setError(false);
    api
      .get<TutoringSession>(`/tutoring/sessions/${id}`)
      .then(setSession)
      .catch(() => setError(true));
  }, [id]);

  useEffect(load, [load]);

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo completar la acción');
    } finally {
      setBusy(false);
    }
  }

  // Iniciar = tomar lista primero (pedido 2026-10-02): los marcados asistieron, el resto
  // queda ausente; el correo de inicio a cada representante lo indica.
  function openStart() {
    // Este clic desbloquea el audio del navegador para la alarma del cronómetro.
    unlockAlarm();
    setStartPresent(new Set());
    setStartOpen(true);
  }

  async function handleStart() {
    unlockAlarm();
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/tutoring/sessions/${id}/start`, { presentEnrollmentIds: [...startPresent] });
      router.push(`/en-curso/${id}`);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo iniciar la tutoría');
      setBusy(false);
    }
  }

  function handleCancel() {
    runAction(() => api.post(`/tutoring/sessions/${id}/cancel`, { reason: cancelReason })).then(() =>
      setCancelOpen(false),
    );
  }

  function addStudent(studentId: string) {
    runAction(() =>
      api.post(`/tutoring/sessions/${id}/enrollments`, { students: [{ studentId, reason }] }),
    );
  }

  function cancelEnrollment(enrollmentId: string) {
    runAction(() => api.delete(`/tutoring/enrollments/${enrollmentId}`));
  }

  if (error) return <ErrorState title="No se pudo cargar la tutoría" onRetry={load} />;
  if (!session) return <Spinner />;

  const activeEnrollments = session.enrollments?.filter((e) => e.status !== 'CANCELLED') ?? [];
  const isFull = activeEnrollments.length >= session.capacity;
  const canManage = user && ['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST'].includes(user.role);
  const canOperate = user && ['ADMIN', 'TEACHER'].includes(user.role);
  // CU-06 (backend CANCEL_ROLES): DECE y docente pueden cancelar, no solo DECE/Admin.
  const canCancel = user && ['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST', 'TEACHER'].includes(user.role);
  // El docente puede sumar estudiantes a SUS tutorías (el backend valida que sea suya).
  const canEnroll = canManage || user?.role === 'TEACHER';
  const reportPending = session.status === 'COMPLETED' && !session.report;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/agenda" className="mb-4 inline-block text-sm text-ink-soft hover:text-ink">
        ← Agenda
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-2xl">
            {session.subject?.name ?? 'Bloque'} {session.level ? `· ${session.level.name}` : ''}
          </h1>
          <p className="font-mono text-sm text-ink-soft">
            {session.date.slice(0, 10)} · {session.startTime}–{session.endTime}
          </p>
        </div>
        <StatusBadge status={session.status} />
      </div>

      {actionError && (
        <div className="mb-4 rounded-md bg-status-danger-tint px-3 py-2 text-sm text-status-danger">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Estudiantes ({activeEnrollments.length}/{session.capacity})
            </span>
            {canEnroll && session.status === 'SCHEDULED' && !isFull && (
              <Button variant="ghost" onClick={() => setAddOpen(true)}>
                + Agregar
              </Button>
            )}
          </CardHeader>
          <CardBody>
            {activeEnrollments.length === 0 && (
              <EmptyState
                title="Aún no hay estudiantes inscritos"
                action={
                  canEnroll &&
                  session.status === 'SCHEDULED' && <Button onClick={() => setAddOpen(true)}>Agregar</Button>
                }
              />
            )}
            <ul className="divide-y divide-line">
              {activeEnrollments.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div>
                      {e.student ? fullName(e.student) : '—'}
                      {e.student?.parallel && <span className="ml-1 text-xs text-ink-soft">· Paralelo {e.student.parallel.name}</span>}
                    </div>
                    <div className="text-xs text-ink-soft">{ENROLLMENT_REASON_LABEL[e.reason]}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={e.status === 'ATTENDED' ? 'accent' : e.status === 'ABSENT' ? 'danger' : 'neutral'}>
                      {e.status}
                    </Badge>
                    {canManage && session.status === 'SCHEDULED' && (
                      <button
                        onClick={() => cancelEnrollment(e.id)}
                        className="text-xs text-status-danger hover:underline"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {session.waitlist && session.waitlist.filter((w) => w.status === 'WAITING').length > 0 && (
              <div className="mt-4 border-t border-line pt-3">
                <h4 className="mb-2 text-xs font-medium uppercase text-ink-soft">Lista de espera</h4>
                <ul className="text-sm">
                  {session.waitlist
                    .filter((w) => w.status === 'WAITING')
                    .sort((a, b) => a.position - b.position)
                    .map((w) => (
                      <li key={w.id}>
                        {w.position}. {w.student ? fullName(w.student) : '—'}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-medium">Docente y acciones</span>
          </CardHeader>
          <CardBody>
            <dl className="mb-4 grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-ink-soft">Docente</dt>
              <dd>{session.teacher ? fullName(session.teacher) : '—'}</dd>
              <dt className="text-ink-soft">Paralelos</dt>
              <dd>
                {[...new Set(activeEnrollments.map((e) => e.student?.parallel?.name).filter(Boolean))]
                  .sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }))
                  .join(', ') ||
                  session.parallel?.name ||
                  '—'}
              </dd>
              <dt className="text-ink-soft">Lugar</dt>
              <dd>{session.location ?? '—'}</dd>
              {session.status === 'COMPLETED' && (
                <>
                  <dt className="text-ink-soft">Cierre</dt>
                  <dd>
                    {session.autoCompleted
                      ? session.startedAt
                        ? 'Automático al cumplir 40 min'
                        : 'Automático (no se inició)'
                      : 'Finalizada por el docente'}
                  </dd>
                </>
              )}
              {session.cancelReason && (
                <>
                  <dt className="text-ink-soft">Motivo cancelación</dt>
                  <dd>{session.cancelReason}</dd>
                </>
              )}
            </dl>

            <div className="flex flex-col gap-2">
              {canOperate && session.status === 'SCHEDULED' && (
                <Button disabled={busy || activeEnrollments.length === 0} onClick={openStart}>
                  Tomar lista e iniciar
                </Button>
              )}
              {canOperate && session.status === 'IN_PROGRESS' && (
                <Button onClick={() => router.push(`/en-curso/${session.id}`)}>
                  Ir a la tutoría en curso
                </Button>
              )}
              {canOperate && reportPending && (
                <Button onClick={() => router.push(`/en-curso/${session.id}`)}>
                  Completar informe pendiente
                </Button>
              )}
              {canCancel && (session.status === 'AVAILABLE' || session.status === 'SCHEDULED' || session.status === 'IN_PROGRESS') && (
                <Button variant="danger" disabled={busy} onClick={() => setCancelOpen(true)}>
                  Cancelar tutoría
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {(session.report || reportPending) && (
        <Card className="mt-6">
          <CardHeader className="flex items-center justify-between">
            <span className="text-sm font-medium">Informe de cierre</span>
            {reportPending && <Badge tone="danger">Pendiente</Badge>}
          </CardHeader>
          <CardBody>
            {session.report ? (
              <dl className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
                <div>
                  <dt className="mb-1 text-xs uppercase text-ink-soft">Destrezas trabajadas</dt>
                  <dd className="whitespace-pre-line">{session.report.skills}</dd>
                </div>
                <div>
                  <dt className="mb-1 text-xs uppercase text-ink-soft">Observaciones</dt>
                  <dd className="whitespace-pre-line">{session.report.observations}</dd>
                </div>
                <div>
                  <dt className="mb-1 text-xs uppercase text-ink-soft">Tareas asignadas</dt>
                  <dd className="whitespace-pre-line">{session.report.tasks || '—'}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-ink-soft">
                La tutoría se cerró automáticamente al cumplirse los 40 minutos. El docente aún no registra
                destrezas, observaciones y tareas.
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <Modal open={startOpen} onClose={() => setStartOpen(false)} title="¿Quiénes asistieron?">
        <p className="mb-3 text-sm text-ink-soft">
          Marca a los estudiantes presentes. Al iniciar se avisa por correo a cada representante si su
          representado asistió o está ausente.
        </p>
        <AttendanceChecklist enrollments={activeEnrollments} present={startPresent} onChange={setStartPresent} disabled={busy} />
        {actionError && <p className="mt-3 text-sm text-status-danger">{actionError}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setStartOpen(false)}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={handleStart}>
            {busy ? 'Iniciando…' : 'Iniciar tutoría'}
          </Button>
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancelar tutoría">
        <p className="mb-3 text-sm text-ink-soft">¿Deseas cancelar esta tutoría? Esta acción no se puede deshacer.</p>
        <Input
          label="Motivo"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          required
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCancelOpen(false)}>
            Volver
          </Button>
          <Button variant="danger" disabled={!cancelReason || busy} onClick={handleCancel}>
            Confirmar cancelación
          </Button>
        </div>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Agregar estudiante">
        <div className="mb-3">
          <Select label="Motivo" value={reason} onChange={(e) => setReason(e.target.value as EnrollmentReason)}>
            {(Object.keys(ENROLLMENT_REASON_LABEL) as EnrollmentReason[]).map((r) => (
              <option key={r} value={r}>
                {ENROLLMENT_REASON_LABEL[r]}
              </option>
            ))}
          </Select>
        </div>
        {addOpen && (
          <StudentPicker
            levelId={session.levelId}
            assignmentId={session.teacherAssignmentId}
            isSelected={(sid) => activeEnrollments.some((e) => e.studentId === sid)}
            canAddMore={!isFull}
            onAdd={(st) => {
              addStudent(st.id);
              setAddOpen(false);
            }}
          />
        )}
      </Modal>
    </div>
  );
}
