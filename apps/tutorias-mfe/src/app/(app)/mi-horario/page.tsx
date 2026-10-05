'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { parallelsSuffix } from '@/lib/format';
import { useRequireAuth } from '@/lib/auth';
import type { AvailabilityRule, DayOfWeek, Teacher, TeacherAssignment } from '@/lib/types';
import { DAY_OF_WEEK_LABEL } from '@/lib/types';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';

type MyTeacher = Teacher & {
  assignments: (TeacherAssignment & { availabilityRules: AvailabilityRule[] })[];
};

const DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

/**
 * El docente sube su horario de tutorías (pedido 7/9/2026). Un horario por cada materia+nivel
 * que tiene asignado; el sistema lo divide en bloques de 40 min que luego se agendan.
 */
export default function MySchedulePage() {
  useRequireAuth(['TEACHER']);
  const [me, setMe] = useState<MyTeacher | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignmentId, setAssignmentId] = useState('');
  const [day, setDay] = useState<DayOfWeek>('MONDAY');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('08:40');
  const [location, setLocation] = useState('');
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [preview, setPreview] = useState<{ startTime: string; endTime: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .get<MyTeacher>('/teachers/me')
      .then((t) => {
        setMe(t);
        setAssignmentId((prev) => prev || t.assignments.find((a) => a.isActive)?.id || '');
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'No se pudo cargar tu ficha'));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    api
      .get<{ startTime: string; endTime: string }[]>(
        `/availability/rules/preview?startTime=${startTime}&endTime=${endTime}`,
      )
      .then(setPreview)
      .catch(() => setPreview([]));
  }, [startTime, endTime]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post('/availability/rules', {
        teacherAssignmentId: assignmentId,
        dayOfWeek: day,
        startTime,
        endTime,
        location: location.trim(),
      });
      // Proyecta de inmediato los bloques de 40 min para que ya aparezcan en la agenda.
      await api.post('/availability/generate');
      setSaved('Horario guardado. Tus bloques ya están disponibles en la agenda.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el horario');
    } finally {
      setBusy(false);
    }
  }

  async function saveLocation() {
    if (!editing || editing.value.trim().length < 2) return;
    setError(null);
    try {
      await api.patch(`/availability/rules/${editing.id}`, { location: editing.value.trim() });
      setEditing(null);
      setSaved('Lugar actualizado. Se aplicó también a tus bloques libres desde hoy.');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el lugar');
    }
  }

  async function toggle(rule: AvailabilityRule) {
    setError(null);
    try {
      await api.patch(`/availability/rules/${rule.id}`, { isActive: !rule.isActive });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar');
    }
  }

  if (loadError) return <ErrorState title={loadError} onRetry={load} />;
  if (!me) return <Spinner />;

  const active = me.assignments.filter((a) => a.isActive);
  const rules = me.assignments.flatMap((a) => a.availabilityRules.map((r) => ({ ...r, assignment: a })));

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-2xl">Mi horario de tutorías</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Declara cuándo atiendes tutorías para cada materia y nivel que tienes asignado. Cada rango se
        divide en bloques de 40 minutos.
      </p>

      {active.length === 0 ? (
        <EmptyState title="Aún no tienes materias y niveles asignados. Pide al administrador que registre tus asignaciones." />
      ) : (
        <Card className="mb-6">
          <CardHeader>
            <span className="text-sm font-medium">Agregar horario</span>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="md:col-span-4">
                <Input
                  label="Lugar donde darás estas tutorías *"
                  placeholder="Ej.: Aula 204 · Bloque B, Laboratorio de Física, Biblioteca"
                  value={location}
                  maxLength={120}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <Select label="Materia · Nivel" value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
                {active.map((a) => (
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
            </div>
            <p className="mt-3 text-xs text-ink-soft">
              {preview.length > 0
                ? `Se crearán ${preview.length} bloque(s): ${preview.map((b) => `${b.startTime}–${b.endTime}`).join(', ')}`
                : 'El rango debe ser múltiplo de 40 minutos (ej. 08:00–08:40, 08:00–09:20).'}
            </p>
            {error && <p className="mt-3 text-sm text-status-danger">{error}</p>}
            {saved && <p className="mt-3 text-sm text-accent-ink">{saved}</p>}
            <p className="mt-1 text-xs text-ink-soft">
              El lugar se copia a cada tutoría de este horario: no hace falta escribirlo al agendar.
            </p>
            <Button
              className="mt-4"
              disabled={!assignmentId || preview.length === 0 || location.trim().length < 2 || busy}
              onClick={save}
            >
              {busy ? 'Guardando…' : 'Guardar horario'}
            </Button>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <span className="text-sm font-medium">Horarios declarados</span>
        </CardHeader>
        {rules.length === 0 ? (
          <CardBody>
            <p className="text-sm text-ink-soft">Todavía no declaraste ningún horario.</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {r.assignment.subject?.name} · {r.assignment.level?.name}
                  </span>{' '}
                  <span className="text-ink-soft">
                    — {DAY_OF_WEEK_LABEL[r.dayOfWeek]} <span className="font-mono">{r.startTime}–{r.endTime}</span>
                  </span>
                  {editing?.id === r.id ? (
                    <span className="mt-1 flex items-center gap-2">
                      <input
                        autoFocus
                        aria-label="Lugar"
                        value={editing.value}
                        maxLength={120}
                        onChange={(e) => setEditing({ id: r.id, value: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && saveLocation()}
                        className="flex-1 rounded-md border border-line px-2 py-1 text-sm outline-none focus:border-accent"
                      />
                      <button onClick={saveLocation} className="text-xs font-medium text-accent-ink">Guardar</button>
                      <button onClick={() => setEditing(null)} className="text-xs text-ink-soft">Cancelar</button>
                    </span>
                  ) : (
                    <span className="mt-0.5 block text-xs">
                      {r.location ? (
                        <span className="text-ink-soft">📍 {r.location}</span>
                      ) : (
                        <span className="text-status-warning">Sin lugar definido</span>
                      )}{' '}
                      <button onClick={() => setEditing({ id: r.id, value: r.location ?? '' })} className="ml-1 text-accent-ink hover:underline">
                        {r.location ? 'Cambiar' : 'Definir lugar'}
                      </button>
                    </span>
                  )}
                </span>
                <button onClick={() => toggle(r)} title="Activar / desactivar">
                  <Badge tone={r.isActive ? 'accent' : 'neutral'}>{r.isActive ? 'Activo' : 'Inactivo'}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
