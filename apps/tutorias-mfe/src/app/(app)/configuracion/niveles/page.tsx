'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { AcademicPeriod, Level } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';

export default function LevelsPage() {
  useRequireAuth(['ADMIN']);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [levels, setLevels] = useState<Level[] | null>(null);
  const [levelName, setLevelName] = useState('');
  const [parallelName, setParallelName] = useState<Record<string, string>>({});
  // Animador por curso (pedido 2026-09-30): borrador del correo por paralelo.
  const [animator, setAnimator] = useState<Record<string, string>>({});
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AcademicPeriod[]>('/academic/periods').then((p) => {
      setPeriods(p);
      const active = p.find((x) => x.isActive) ?? p[0];
      if (active) setPeriodId(active.id);
    });
  }, []);

  function load() {
    if (!periodId) return;
    api.get<Level[]>(`/academic/levels?academicPeriodId=${periodId}`).then((ls) => {
      setLevels(ls);
      const draft: Record<string, string> = {};
      ls.forEach((l) => l.parallels?.forEach((p) => (draft[p.id] = p.animatorEmail ?? '')));
      setAnimator(draft);
    });
  }

  useEffect(load, [periodId]);

  async function addLevel() {
    setError(null);
    try {
      await api.post('/academic/levels', { name: levelName, order: (levels?.length ?? 0) + 1, academicPeriodId: periodId });
      setLevelName('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el nivel');
    }
  }

  async function addParallel(levelId: string) {
    const name = parallelName[levelId];
    if (!name) return;
    setError(null);
    try {
      await api.post('/academic/parallels', { name, levelId });
      setParallelName((prev) => ({ ...prev, [levelId]: '' }));
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el paralelo');
    }
  }

  async function saveAnimator(parallelId: string) {
    setError(null);
    setSavedId(null);
    try {
      await api.patch(`/academic/parallels/${parallelId}`, { animatorEmail: animator[parallelId]?.trim() || null });
      setSavedId(parallelId);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el animador');
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl">Niveles, paralelos y animadores</h1>
      <p className="mb-6 text-sm text-ink-soft">
        El animador de cada curso ve solo a los alumnos de su paralelo que tuvieron tutorías y genera
        reportes de ese curso. Además, su cuenta debe tener el rol <strong>Animador de curso</strong> en el
        portal (Usuarios y roles).
      </p>

      <div className="mb-4">
        <Select label="Período académico" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      <Card className="mb-6">
        <div className="flex items-end gap-3 p-5">
          <Input label="Nuevo nivel" placeholder="11.º EGB" value={levelName} onChange={(e) => setLevelName(e.target.value)} />
          <Button disabled={!levelName || !periodId} onClick={addLevel}>
            Agregar nivel
          </Button>
        </div>
        {error && <p className="px-5 pb-4 text-sm text-status-danger">{error}</p>}
      </Card>

      {!levels && <Spinner />}
      {levels && levels.length === 0 && <EmptyState title="Aún no hay niveles configurados para este período." />}
      {levels && levels.length > 0 && (
        <div className="flex flex-col gap-4">
          {levels.map((l) => (
            <Card key={l.id}>
              <div className="border-b border-line px-5 py-3 font-medium">{l.name}</div>
              <ul className="divide-y divide-line">
                {(l.parallels ?? []).map((p) => {
                  const dirty = (animator[p.id] ?? '') !== (p.animatorEmail ?? '');
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-2 text-sm">
                      <span className="w-24 text-ink-soft">Paralelo {p.name}</span>
                      <input
                        type="email"
                        aria-label={`Animador del paralelo ${p.name}`}
                        placeholder="animador@uets.edu.ec"
                        value={animator[p.id] ?? ''}
                        onChange={(e) => setAnimator((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        className="min-w-56 flex-1 rounded-md border border-line px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                      />
                      <Button variant="secondary" disabled={!dirty} onClick={() => saveAnimator(p.id)}>
                        Guardar
                      </Button>
                      {savedId === p.id && <span className="text-xs text-accent-ink">Guardado</span>}
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-end gap-2 p-3">
                <Input
                  placeholder="Nuevo paralelo (ej. C)"
                  value={parallelName[l.id] ?? ''}
                  onChange={(e) => setParallelName((prev) => ({ ...prev, [l.id]: e.target.value }))}
                />
                <Button variant="secondary" onClick={() => addParallel(l.id)}>
                  Agregar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
