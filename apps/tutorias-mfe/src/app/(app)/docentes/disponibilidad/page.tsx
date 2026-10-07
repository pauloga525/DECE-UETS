'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { AvailabilityRule } from '@/lib/types';
import { DAY_OF_WEEK_LABEL } from '@/lib/types';
import { fullName } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';

import { Pagination, usePagination } from '@/components/ui/Pagination';
export default function AvailabilityOverviewPage() {
  useRequireAuth(['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST']);
  const [rules, setRules] = useState<AvailabilityRule[] | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api
      .get<AvailabilityRule[]>('/availability/rules')
      .then(setRules)
      .catch(() => setError(true));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (rules ?? []).filter((r) => {
      const teacher = r.teacherAssignment?.teacher;
      return !q || (teacher && fullName(teacher).toLowerCase().includes(q));
    });
  }, [rules, search]);

  const pg = usePagination(filtered);
  return (
    <div>
      <h1 className="mb-1 text-2xl">Disponibilidad de docentes</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Horario recurrente que cada docente declaró para cada materia y nivel que atiende — de acá
        sale la Agenda.
      </p>

      <div className="mb-4">
        <Input placeholder="Buscar por docente…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <ErrorState title="No se pudo cargar la disponibilidad" />}
      {!error && !rules && <Spinner />}
      {!error && rules && filtered.length === 0 && (
        <EmptyState title="No se encontraron horarios con ese criterio." />
      )}
      {!error && filtered.length > 0 && (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-white font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-line">
                <th className="px-4 py-2 text-left">Docente</th>
                <th className="px-4 py-2 text-left">Materia · Nivel</th>
                <th className="px-4 py-2 text-left">Día</th>
                <th className="px-4 py-2 text-left">Horario</th>
                <th className="px-4 py-2 text-left">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pg.pageItems.map((r) => (
                <tr key={r.id} className="hover:bg-paper">
                  <td className="px-4 py-2">
                    <Link
                      href={`/docentes/${r.teacherAssignment?.teacherId}`}
                      className="font-medium text-accent-ink"
                    >
                      {r.teacherAssignment?.teacher ? fullName(r.teacherAssignment.teacher) : '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-ink-soft">
                    {r.teacherAssignment?.subject?.name} · {r.teacherAssignment?.level?.name}
                  </td>
                  <td className="px-4 py-2">{DAY_OF_WEEK_LABEL[r.dayOfWeek]}</td>
                  <td className="px-4 py-2 font-mono">
                    {r.startTime}–{r.endTime}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={r.isActive ? 'accent' : 'neutral'}>{r.isActive ? 'Activa' : 'Inactiva'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Pagination {...pg} />
    </div>
  );
}
