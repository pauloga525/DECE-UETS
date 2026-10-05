'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Student, Teacher, TutoringSession } from '@/lib/types';
import { ENROLLMENT_REASON_LABEL, EnrollmentReason } from '@/lib/types';
import { fullName, todayInputValue } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { StudentPicker } from '@/components/StudentPicker';
import { TUTORING_CAPACITY } from '@/lib/constants';

// 5 pasos (antes 6): el bloque elegido en el paso 3 ya trae materia y nivel fijos — los puso
// el docente al declarar su horario, así que el DECE ya no los elige (cambio de lógica).
const STEPS = ['Fecha', 'Docente', 'Bloque', 'Estudiantes', 'Confirmar'];
const REASONS = Object.keys(ENROLLMENT_REASON_LABEL) as EnrollmentReason[];

interface DraftStudent {
  studentId: string;
  student: Student;
  reason: EnrollmentReason;
  reasonNote: string;
}

export default function CrearTutoriaPage() {
  const router = useRouter();
  const { user } = useAuth();
  // El docente solo crea tutorías para sí mismo (pedido 7/9/2026): el paso "Docente" queda
  // fijo con su propia ficha. El backend lo valida igual.
  const isTeacher = user?.role === 'TEACHER';
  const searchParams = useSearchParams();
  const preselectedSessionId = searchParams.get('sessionId');

  const [step, setStep] = useState(1);
  const [date, setDate] = useState(todayInputValue());
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teacherId, setTeacherId] = useState('');
  const [blocks, setBlocks] = useState<TutoringSession[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<TutoringSession | null>(null);
  const [location, setLocation] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<DraftStudent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingPreselect, setLoadingPreselect] = useState(!!preselectedSessionId);

  // El bloque elegido puede ya estar SCHEDULED con cupo libre — en ese caso no se agenda una
  // tutoría nueva, se suman estudiantes a la que ya existe (paralelo incluido, ya viene fijo).
  const isAddingToExisting = selectedBlock?.status === 'SCHEDULED';
  const existingCount = selectedBlock?.enrollments?.length ?? 0;
  const capacity = selectedBlock?.capacity ?? TUTORING_CAPACITY;
  const remainingCapacity = capacity - existingCount;

  useEffect(() => {
    if (!user) return;
    if (isTeacher) {
      api
        .get<Teacher>('/teachers/me')
        .then((me) => {
          setTeachers([me]);
          setTeacherId(me.id);
        })
        .catch((err) =>
          setError(err instanceof ApiError ? err.message : 'No se encontró tu ficha de docente'),
        );
    } else {
      api.get<Teacher[]>('/teachers').then(setTeachers).catch(() => {});
    }
  }, [user, isTeacher]);

  // Preselección desde la Agenda (sección 9.3, pantalla 07): bloque AVAILABLE -> salta al paso 4
  // (ya trae materia/nivel puestos, solo falta paralelo + estudiantes).
  useEffect(() => {
    if (!preselectedSessionId) return;
    api
      .get<TutoringSession>(`/tutoring/sessions/${preselectedSessionId}`)
      .then((session) => {
        setDate(session.date.slice(0, 10));
        setTeacherId(session.teacherId);
        setSelectedBlock(session);
        setLocation(session.location ?? '');
        setStep(4);
      })
      .catch(() => setError('No se pudo cargar el bloque seleccionado'))
      .finally(() => setLoadingPreselect(false));
  }, [preselectedSessionId]);

  function goToStep3() {
    setBlocks([]);
    api
      .get<TutoringSession[]>(`/tutoring/sessions/available?teacherId=${teacherId}&date=${date}`)
      .then(setBlocks)
      .catch(() => setError('No se pudo cargar la disponibilidad'));
    setStep(3);
  }

  function selectBlock(block: TutoringSession) {
    setSelectedBlock(block);
    // El lugar viene del horario del docente (pedido 2026-10-02); se puede ajustar.
    setLocation(block.location ?? '');
    setStep(4);
  }


  function addStudent(student: Student) {
    const max = isAddingToExisting ? remainingCapacity : capacity;
    if (selectedStudents.length >= max) return;
    if (selectedStudents.some((s) => s.studentId === student.id)) return;
    setSelectedStudents((prev) => [
      ...prev,
      { studentId: student.id, student, reason: 'ACADEMIC_REINFORCEMENT', reasonNote: '' },
    ]);
  }

  function removeStudent(studentId: string) {
    setSelectedStudents((prev) => prev.filter((s) => s.studentId !== studentId));
  }

  function updateStudent(studentId: string, patch: Partial<DraftStudent>) {
    setSelectedStudents((prev) => prev.map((s) => (s.studentId === studentId ? { ...s, ...patch } : s)));
  }

  async function handleConfirm() {
    if (!selectedBlock) return;
    setSubmitting(true);
    setError(null);
    const students = selectedStudents.map((s) => ({
      studentId: s.studentId,
      reason: s.reason,
      reasonNote: s.reasonNote || undefined,
    }));
    try {
      if (isAddingToExisting) {
        await api.post(`/tutoring/sessions/${selectedBlock.id}/enrollments`, { students });
      } else {
        await api.post(`/tutoring/sessions/${selectedBlock.id}/schedule`, {
          location: location.trim(),
          students,
        });
      }
      router.push(`/sesiones/${selectedBlock.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo completar la operación');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedTeacher = useMemo(() => teachers.find((t) => t.id === teacherId), [teachers, teacherId]);
  const maxNewStudents = isAddingToExisting ? remainingCapacity : capacity;

  if (loadingPreselect) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl">Crear tutoría</h1>
      <p className="mb-6 text-sm text-ink-soft">
        En ningún paso se muestra una opción que el sistema rechazaría después.
      </p>

      <ol className="mb-8 flex flex-wrap gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n === step ? 'current' : n < step ? 'done' : 'pending';
          return (
            <li
              key={label}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                state === 'current'
                  ? 'border-accent bg-accent-tint text-accent-ink font-medium'
                  : state === 'done'
                    ? 'border-line bg-status-inactive-tint text-ink-soft'
                    : 'border-line text-ink-soft'
              }`}
            >
              <span className="font-mono">{n}</span>
              {label}
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="mb-4 rounded-md bg-status-danger-tint px-3 py-2 text-sm text-status-danger">{error}</div>
      )}

      {step === 1 && (
        <Card>
          <CardBody>
            <Input type="date" label="Fecha de la tutoría" value={date} onChange={(e) => setDate(e.target.value)} />
            {isTeacher && (
              <p className="mt-3 text-sm text-ink-soft">
                Docente: <span className="font-medium text-ink">{selectedTeacher ? fullName(selectedTeacher) : '…'}</span>{' '}
                — solo puedes crear tutorías en tus propios horarios.
              </p>
            )}
            <Button
              className="mt-4"
              disabled={isTeacher && !teacherId}
              onClick={() => (isTeacher ? goToStep3() : setStep(2))}
            >
              Continuar
            </Button>
          </CardBody>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardBody>
            <Select label="Docente" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Selecciona un docente</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {fullName(t)}
                </option>
              ))}
            </Select>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button disabled={!teacherId} onClick={goToStep3}>
                Continuar
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardBody>
            <h3 className="mb-3 text-sm font-medium">
              Bloques de {selectedTeacher ? fullName(selectedTeacher) : ''} el {date}
            </h3>
            {blocks.length === 0 && <EmptyState title="Este docente no tiene disponibilidad este día." />}
            <div className="flex flex-col gap-2">
              {blocks.map((b) => {
                const count = b.enrollments?.length ?? 0;
                return (
                  <button
                    key={b.id}
                    onClick={() => selectBlock(b)}
                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
                      selectedBlock?.id === b.id
                        ? 'border-accent bg-accent-tint text-accent-ink'
                        : 'border-line hover:border-accent'
                    }`}
                  >
                    <span className="font-mono">
                      {b.startTime}–{b.endTime}
                    </span>
                    <span className="text-ink-soft">
                      {b.subject?.name} · {b.level?.name}
                    </span>
                    {b.status === 'AVAILABLE' ? (
                      <Badge tone="accent">Disponible</Badge>
                    ) : (
                      <Badge tone="waitlist">
                        Programada · {count}/{b.capacity} (quedan {b.capacity - count})
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={() => setStep(isTeacher ? 1 : 2)}>
                Atrás
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 4 && selectedBlock && (
        <Card>
          <CardBody>
            <div className="mb-4 rounded-md bg-paper px-3 py-2 text-sm">
              <span className="font-medium">
                {selectedBlock.subject?.name} · {selectedBlock.level?.name}
              </span>{' '}
              <span className="font-mono text-ink-soft">
                {selectedBlock.startTime}–{selectedBlock.endTime}
              </span>
              {isAddingToExisting && (
                <p className="mt-1 text-xs text-ink-soft">
                  Ya está programada — cupo {existingCount}/{capacity},
                  quedan {remainingCapacity}. Esto suma estudiantes, no crea una tutoría nueva.
                </p>
              )}
            </div>

            {!isAddingToExisting && (
              <div className="mb-4">
                <Input
                  label={selectedBlock.location ? 'Lugar de la tutoría (del horario del docente)' : 'Lugar de la tutoría *'}
                  placeholder="Ej.: Aula 204 · Bloque B, Sala DECE, Biblioteca"
                  value={location}
                  maxLength={120}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            )}


            <h3 className="mb-1 text-sm font-medium">Buscar estudiante</h3>
            <p className="mb-2 text-xs text-ink-soft">
              Estudiantes de {selectedBlock.level?.name} de los paralelos donde el docente dicta esta materia: puedes reunir
              alumnos de distintos paralelos en la misma tutoría.
            </p>
            <StudentPicker
              levelId={selectedBlock.levelId}
              assignmentId={selectedBlock.teacherAssignmentId}
              isSelected={(id) => selectedStudents.some((sel) => sel.studentId === id)}
              canAddMore={selectedStudents.length < maxNewStudents}
              onAdd={addStudent}
            />

            <h3 className="mb-2 text-sm font-medium">
              Seleccionados ({selectedStudents.length}/{maxNewStudents})
            </h3>
            {selectedStudents.length === 0 && (
              <p className="mb-4 text-sm text-ink-soft">Aún no has agregado estudiantes.</p>
            )}
            <div className="mb-4 flex flex-col gap-3">
              {selectedStudents.map((s) => (
                <div key={s.studentId} className="rounded-md border border-line p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {fullName(s.student)}
                      {s.student.parallel && (
                        <span className="ml-2 rounded-full bg-status-scheduled-tint px-2 py-0.5 text-xs font-medium text-status-scheduled">
                          Paralelo {s.student.parallel.name}
                        </span>
                      )}
                    </span>
                    <button onClick={() => removeStudent(s.studentId)} className="text-xs text-status-danger">
                      Quitar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <Select
                      label="Motivo"
                      value={s.reason}
                      onChange={(e) => updateStudent(s.studentId, { reason: e.target.value as EnrollmentReason })}
                    >
                      {REASONS.map((r) => (
                        <option key={r} value={r}>
                          {ENROLLMENT_REASON_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label="Observación (opcional)"
                      value={s.reasonNote}
                      onChange={(e) => updateStudent(s.studentId, { reasonNote: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              {!preselectedSessionId && (
                <Button variant="secondary" onClick={() => setStep(3)}>
                  Atrás
                </Button>
              )}
              <Button
                disabled={
                  (!isAddingToExisting && location.trim().length < 2) ||
                  selectedStudents.length === 0
                }
                onClick={() => setStep(5)}
              >
                Continuar
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 5 && selectedBlock && (
        <Card>
          <CardBody>
            <h3 className="mb-3 text-sm font-medium">
              {isAddingToExisting ? 'Resumen — sumar a tutoría existente' : 'Resumen'}
            </h3>
            <dl className="mb-4 grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-ink-soft">Docente</dt>
              <dd>{selectedTeacher ? fullName(selectedTeacher) : ''}</dd>
              <dt className="text-ink-soft">Materia · Nivel</dt>
              <dd>
                {selectedBlock.subject?.name} · {selectedBlock.level?.name}
              </dd>
              <dt className="text-ink-soft">Horario</dt>
              <dd className="font-mono">
                {date} · {selectedBlock.startTime}–{selectedBlock.endTime}
              </dd>
              <dt className="text-ink-soft">Paralelos</dt>
              <dd>
                {[...new Set(selectedStudents.map((s) => s.student.parallel?.name).filter(Boolean))]
                  .sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }))
                  .join(', ') || '—'}
              </dd>
              <dt className="text-ink-soft">Lugar</dt>
              <dd>{isAddingToExisting ? (selectedBlock.location ?? '—') : location}</dd>
              <dt className="text-ink-soft">Estudiantes nuevos</dt>
              <dd>
                {selectedStudents.length}
                {isAddingToExisting ? ` (quedará ${existingCount + selectedStudents.length}/${capacity})` : `/${capacity}`}
              </dd>
            </dl>
            <ul className="mb-4 divide-y divide-line rounded-md border border-line text-sm">
              {selectedStudents.map((s) => (
                <li key={s.studentId} className="px-3 py-2">
                  {fullName(s.student)}
                  {s.student.parallel && <span className="text-ink-soft"> · Paralelo {s.student.parallel.name}</span>} —{' '}
                  {ENROLLMENT_REASON_LABEL[s.reason]}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep(4)}>
                Atrás
              </Button>
              <Button disabled={submitting} onClick={handleConfirm}>
                {submitting ? 'Confirmando…' : 'Confirmar'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
