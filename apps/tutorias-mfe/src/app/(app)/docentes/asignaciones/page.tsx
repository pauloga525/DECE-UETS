'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { TeacherAssignment } from '@/lib/types';
import { fullName } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';

import { Pagination, usePagination } from '@/components/ui/Pagination';
export default function TeacherAssignmentsOverviewPage() {
  useRequireAuth(['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST']);
  const [assignments, setAssignments] = useState<TeacherAssignment[] | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api
      .get<TeacherAssignment[]>('/teachers/assignments/list')
      .then(setAssignments)
      .catch(() => setError(true));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (assignments ?? []).filter(
      (a) =>
        !q ||
        `${a.teacher ? fullName(a.teacher) : ''} ${a.subject?.name ?? ''} ${a.level?.name ?? ''}`.toLowerCase().includes(q),
    );
  }, [assignments, search]);

  const pg = usePagination(filtered);
  return (
    <div>
      <h1 className="mb-1 text-2xl">Asignaciones académicas</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Qué materia, nivel y paralelos atiende cada docente — la base de la que sale su horario de
        tutoría (sección &ldquo;Disponibilidad&rdquo;).
      </p>

      <div className="mb-4">
        <Input placeholder="Buscar por docente, materia o nivel…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {error && <ErrorState title="No se pudieron cargar las asignaciones" />}
      {!error && !assignments && <Spinner />}
      {!error && assignments && filtered.length === 0 && (
        <EmptyState title="No se encontraron asignaciones con ese criterio." />
      )}
      {!error && filtered.length > 0 && (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-white font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-line">
                <th className="px-4 py-2 text-left">Docente</th>
                <th className="px-4 py-2 text-left">Materia</th>
                <th className="px-4 py-2 text-left">Nivel</th>
                <th className="px-4 py-2 text-left">Paralelos</th>
                <th className="px-4 py-2 text-left">Período</th>
                <th className="px-4 py-2 text-left">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pg.pageItems.map((a) => (
                <tr key={a.id} className="hover:bg-paper">
                  <td className="px-4 py-2">
                    <Link href={`/docentes/${a.teacherId}`} className="font-medium text-accent-ink">
                      {a.teacher ? fullName(a.teacher) : '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{a.subject?.name}</td>
                  <td className="px-4 py-2">{a.level?.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {a.parallels?.length ? a.parallels.map((p) => p.parallel?.name).join(', ') : 'Todos'}
                  </td>
                  <td className="px-4 py-2 text-ink-soft">{a.academicPeriod?.name ?? '—'}</td>
                  <td className="px-4 py-2">
                    <Badge tone={a.isActive ? 'accent' : 'neutral'}>{a.isActive ? 'Vigente' : 'Inactiva'}</Badge>
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
