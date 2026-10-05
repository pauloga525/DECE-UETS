'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { Subject } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';

export default function SubjectsPage() {
  useRequireAuth(['ADMIN']);
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<Subject[]>('/academic/subjects').then(setSubjects);
  }

  useEffect(load, []);

  async function create() {
    setError(null);
    try {
      await api.post('/academic/subjects', { name, code });
      setName('');
      setCode('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ya existe una materia con ese código');
    }
  }

  async function toggleActive(subject: Subject) {
    await api.patch(`/academic/subjects/${subject.id}`, { isActive: !subject.isActive });
    load();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl">Materias</h1>

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3 p-5">
          <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Código" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Button disabled={!name || !code} onClick={create}>
            Crear
          </Button>
        </div>
        {error && <p className="px-5 pb-4 text-sm text-status-danger">{error}</p>}
      </Card>

      {!subjects && <Spinner />}
      {subjects && subjects.length === 0 && <EmptyState title="Aún no hay materias registradas." />}
      {subjects && subjects.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {subjects.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  {s.name} <span className="font-mono text-ink-soft">· {s.code}</span>
                </span>
                <button onClick={() => toggleActive(s)}>
                  <Badge tone={s.isActive ? 'accent' : 'neutral'}>{s.isActive ? 'Activa' : 'Inactiva'}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
