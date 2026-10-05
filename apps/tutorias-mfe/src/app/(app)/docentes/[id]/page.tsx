'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type {
  AcademicPeriod,
  AvailabilityRule,
  DayOfWeek,
  Level,
  Subject,
  Teacher,
  TeacherAssignment,
  TutoringSession,
} from '@/lib/types';
import { DAY_OF_WEEK_LABEL } from '@/lib/types';
import { fullName, todayInputValue, parallelsSuffix } from '@/lib/format';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';

const DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

export default function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  // Solo Admin/DECE llegan a esta pantalla — un docente ya no puede gestionar su propia
  // disponibilidad desde acá (pedido explícito: "otro docente no puede ver ese apartado").
  const { user } = useRequireAuth(['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST']);
  const isAdmin = user?.role === 'ADMIN';
  // Escribir horario/asignaciones queda en manos del Admin: el backend solo lo permite a
  // ADMIN/TEACHER, y como un TEACHER ya no entra aquí, habilitarlo para DECE solo produciría
  // un botón que siempre falla con 403.
  const canManage = isAdmin;

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [tab, setTab] = useState<'asignaciones' | 'disponibilidad'>('asignaciones');

  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [newSubjectId, setNewSubjectId] = useState('');
  const [newLevelId, setNewLevelId] = useState('');
  // Paralelos donde dicta la materia; ninguno marcado = todo el nivel.
  const [newParallelIds, setNewParallelIds] = useState<string[]>([]);

  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [ruleAssignmentId, setRuleAssignmentId] = useState('');
  const [day, setDay] = useState<DayOfWeek>('MONDAY');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('10:40');
  const [ruleLocation, setRuleLocation] = useState('');
  const [preview, setPreview] = useState<{ startTime: string; endTime: string }[]>([]);
  const [date, setDate] = useState(todayInputValue());
  const [dayBlocks, setDayBlocks] = useState<TutoringSession[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const activePeriod = periods.find((p) => p.isActive);

  const loadAssignments = useCallback(() => {
    api.get<TeacherAssignment[]>(`/teachers/assignments/list?teacherId=${id}`).then(setAssignments);
  }, [id]);

  const loadRules = useCallback(() => {
    api.get<AvailabilityRule[]>(`/availability/rules?teacherId=${id}`).then(setRules);
  }, [id]);

  const loadDayBlocks = useCallback(() => {
    api
      .get<TutoringSession[]>(`/tutoring/sessions?teacherId=${id}&date=${date}`)
      .then(setDayBlocks)
      .catch(() => setDayBlocks([]));
  }, [id, date]);

  useEffect(() => {
    api.get<Teacher>(`/teachers/${id}`).then(setTeacher);
    api.get<Subject[]>('/academic/subjects').then(setSubjects);
    api.get<Level[]>('/academic/levels').then(setLevels);
    api.get<AcademicPeriod[]>('/academic/periods').then(setPeriods);
    loadAssignments();
    loadRules();
  }, [id, loadAssignments, loadRules]);

  useEffect(loadDayBlocks, [loadDayBlocks]);

  useEffect(() => {
    if (!startTime || !endTime) return;
    api
      .get<{ startTime: string; endTime: string }[]>(
        `/availability/rules/preview?startTime=${startTime}&endTime=${endTime}`,
      )
      .then(setPreview)
      .catch(() => setPreview([]));
  }, [startTime, endTime]);

  async function addAssignment() {
    if (!activePeriod || !newSubjectId || !newLevelId) return;
    setFormError(null);
    try {
      await api.post('/teachers/assignments', {
        teacherId: id,
        subjectId: newSubjectId,
        levelId: newLevelId,
        academicPeriodId: activePeriod.id,
        parallelIds: newParallelIds,
      });
      setNewSubjectId('');
      setNewLevelId('');
      setNewParallelIds([]);
      loadAssignments();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'No se pudo crear la asignación');
    }
  }

  async function saveRule() {
    if (!ruleAssignmentId) return;
    setFormError(null);
    try {
      await api.post('/availability/rules', {
        teacherAssignmentId: ruleAssignmentId,
        dayOfWeek: day,
        startTime,
        endTime,
        location: ruleLocation.trim(),
      });
      loadRules();
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : 'El horario debe ser múltiplo de 40 minutos',
      );
    }
  }

  async function generateNow() {
    await api.post('/availability/generate');
    loadDayBlocks();
  }

  if (!teacher) return <Spinner />;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl">{fullName(teacher)}</h1>
      <p className="mb-6 text-sm text-ink-soft">{teacher.email}</p>

      <div className="mb-4 flex gap-2 border-b border-line">
        {(['asignaciones', 'disponibilidad'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${
              tab === t ? 'border-accent font-medium text-accent-ink' : 'border-transparent text-ink-soft'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {formError && (
        <div className="mb-4 rounded-md bg-status-danger-tint px-3 py-2 text-sm text-status-danger">
          {formError}
        </div>
      )}

      {tab === 'asignaciones' && (
        <>
          {isAdmin && activePeriod && (
            <Card className="mb-4">
              <CardBody className="flex flex-wrap items-end gap-3">
                <Select label="Materia" value={newSubjectId} onChange={(e) => setNewSubjectId(e.target.value)}>
                  <option value="">Selecciona</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Nivel"
                  value={newLevelId}
                  onChange={(e) => {
                    setNewLevelId(e.target.value);
                    setNewParallelIds([]);
                  }}
                >
                  <option value="">Selecciona</option>
                  {levels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
                {(levels.find((l) => l.id === newLevelId)?.parallels?.length ?? 0) > 0 && (
                  <fieldset className="text-sm">
                    <legend className="mb-1 text-xs text-ink-soft">Paralelos (ninguno = todo el nivel)</legend>
                    <div className="flex flex-wrap gap-3 py-2">
                      {[...(levels.find((l) => l.id === newLevelId)?.parallels ?? [])]
                        .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
                        .map((p) => (
                          <label key={p.id} className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[#1f6f5c]"
                              checked={newParallelIds.includes(p.id)}
                              onChange={(e) =>
                                setNewParallelIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((x) => x !== p.id)))
                              }
                            />
                            {p.name}
                          </label>
                        ))}
                    </div>
                  </fieldset>
                )}
                <Button disabled={!newSubjectId || !newLevelId} onClick={addAssignment}>
                  Agregar asignación
                </Button>
              </CardBody>
            </Card>
          )}
          {assignments.length === 0 && <EmptyState title="Aún no hay asignaciones registradas para este período." />}
          {assignments.length > 0 && (
            <Card>
              <ul className="divide-y divide-line">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span>
                      {a.subject?.name} · {a.level?.name}{parallelsSuffix(a)}
                    </span>
                    <Badge tone={a.isActive ? 'accent' : 'neutral'}>{a.isActive ? 'Vigente' : 'Inactiva'}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {tab === 'disponibilidad' && (
        <>
          {canManage && assignments.length === 0 && (
            <EmptyState title="Este docente aún no tiene asignaciones — asignale una materia y nivel antes de declarar horario." />
          )}
          {canManage && assignments.length > 0 && (
            <Card className="mb-4">
              <CardBody>
                <h3 className="mb-3 text-sm font-medium">Registrar disponibilidad recurrente</h3>
                <p className="mb-3 text-xs text-ink-soft">
                  El horario queda atado a una materia y nivel concretos — repetí este formulario por
                  cada combinación que este docente atienda.
                </p>
                <div className="mb-3 flex flex-wrap items-end gap-3">
                  <Select
                    label="Materia · Nivel"
                    value={ruleAssignmentId}
                    onChange={(e) => setRuleAssignmentId(e.target.value)}
                  >
                    <option value="">Selecciona una asignación</option>
                    {assignments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.subject?.name} · {a.level?.name}{parallelsSuffix(a)}
                      </option>
                    ))}
                  </Select>
                  <Select label="Día" value={day} onChange={(e) => setDay(e.target.value as DayOfWeek)}>
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {DAY_OF_WEEK_LABEL[d]}
                      </option>
                    ))}
                  </Select>
                  <Input label="Desde" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  <Input label="Hasta" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  <Input
                    label="Lugar *"
                    placeholder="Aula 204 · Bloque B"
                    value={ruleLocation}
                    maxLength={120}
                    onChange={(e) => setRuleLocation(e.target.value)}
                  />
                  <Button disabled={!ruleAssignmentId || ruleLocation.trim().length < 2} onClick={saveRule}>
                    Guardar disponibilidad
                  </Button>
                </div>
                {preview.length > 0 && (
                  <p className="text-xs text-ink-soft">
                    Se dividirá en {preview.length} bloque(s): {preview.map((b) => b.startTime).join(', ')}…
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {rules.length > 0 && (
            <Card className="mb-4">
              <ul className="divide-y divide-line">
                {rules.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span>
                      {r.teacherAssignment?.subject?.name} · {r.teacherAssignment?.level?.name}
                      <span className="text-ink-soft">
                        {' '}
                        — {DAY_OF_WEEK_LABEL[r.dayOfWeek]} · {r.startTime}–{r.endTime}
                        {r.location ? ` · ${r.location}` : ' · sin lugar'}
                      </span>
                    </span>
                    <Badge tone={r.isActive ? 'accent' : 'neutral'}>{r.isActive ? 'Activa' : 'Inactiva'}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="mb-3 flex items-end gap-3">
            <Input label="Ver bloques del día" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {canManage && (
              <Button variant="secondary" onClick={generateNow}>
                Generar bloques ahora
              </Button>
            )}
          </div>
          {dayBlocks.length === 0 && <EmptyState title="Este docente no ha registrado disponibilidad para esta fecha." />}
          {dayBlocks.length > 0 && (
            <Card>
              <ul className="divide-y divide-line">
                {dayBlocks
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map((b) => (
                    <li key={b.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <span>
                        <span className="font-mono">
                          {b.startTime}–{b.endTime}
                        </span>{' '}
                        <span className="text-ink-soft">
                          {b.subject?.name} · {b.level?.name}
                        </span>
                      </span>
                      <StatusBadge status={b.status} />
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
