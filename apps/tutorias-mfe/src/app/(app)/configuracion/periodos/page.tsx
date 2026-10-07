'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { AcademicPeriod } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';

import { Pagination, usePagination } from '@/components/ui/Pagination';
export default function AcademicPeriodsPage() {
  useRequireAuth(['ADMIN']);
  const [periods, setPeriods] = useState<AcademicPeriod[] | null>(null);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get<AcademicPeriod[]>('/academic/periods').then(setPeriods);
  }

  useEffect(load, []);

  async function create() {
    setError(null);
    try {
      await api.post('/academic/periods', { name, startDate, endDate });
      setName('');
      setStartDate('');
      setEndDate('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el período');
    }
  }

  async function toggleActive(period: AcademicPeriod) {
    await api.patch(`/academic/periods/${period.id}`, { isActive: !period.isActive });
    load();
  }

  const pg = usePagination(periods ?? []);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl">Períodos académicos</h1>

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3 p-5">
          <Input label="Nombre" placeholder="2026-2027" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Inicio" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="Fin" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <Button disabled={!name || !startDate || !endDate} onClick={create}>
            Crear
          </Button>
        </div>
        {error && <p className="px-5 pb-4 text-sm text-status-danger">{error}</p>}
      </Card>

      {!periods && <Spinner />}
      {periods && periods.length === 0 && <EmptyState title="Aún no hay períodos registrados." />}
      {periods && periods.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {pg.pageItems.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-ink-soft">
                    {p.startDate.slice(0, 10)} → {p.endDate.slice(0, 10)}
                  </div>
                </div>
                <button onClick={() => toggleActive(p)}>
                  <Badge tone={p.isActive ? 'accent' : 'neutral'}>{p.isActive ? 'Activo' : 'Inactivo'}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination {...pg} />
    </div>
  );
}
