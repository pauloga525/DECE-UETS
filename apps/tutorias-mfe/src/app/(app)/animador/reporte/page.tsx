'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, downloadFile } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { ANIMATOR_CAPABLE, courseLabel, useAnimatorCourses } from '@/lib/animator';
import type { ReportBucket, ReportMonthBucket, ReportSummary } from '@/lib/types';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { StudentRegistryReport } from '@/components/StudentRegistryReport';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';

function Bars({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) return <p className="text-sm text-ink-soft">Sin datos.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="truncate text-ink-soft">{i.label}</span>
          <span className="h-2.5 rounded-full bg-paper">
            <span className="block h-2.5 rounded-full bg-accent" style={{ width: `${(i.count / max) * 100}%` }} />
          </span>
          <span className="text-right font-mono">{i.count}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Reporte de tutorías ÚNICAMENTE del curso del animador (pedido 2026-09-30). El servidor
 * fuerza el curso: aunque se manipule la URL, nunca devuelve datos de otro paralelo.
 */
function Report() {
  useRequireAuth(ANIMATOR_CAPABLE);
  const { courses, error: coursesError } = useAnimatorCourses();
  const initial = useSearchParams().get('parallelId') ?? '';
  const [parallelId, setParallelId] = useState(initial);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<{ summary: ReportSummary; months: ReportMonthBucket[]; subjects: ReportBucket[] } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (courses?.length && !courses.some((c) => c.id === parallelId)) setParallelId(courses[0].id);
  }, [courses, parallelId]);

  const query = new URLSearchParams({ parallelId, ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();

  useEffect(() => {
    if (!parallelId) return;
    setData(null);
    setError(false);
    Promise.all([
      api.get<ReportSummary>(`/reports/summary?${query}`),
      api.get<ReportMonthBucket[]>(`/reports/by-month?${query}`),
      api.get<ReportBucket[]>(`/reports/by-subject?${query}`),
    ])
      .then(([summary, months, subjects]) => setData({ summary, months, subjects }))
      .catch(() => setError(true));
  }, [query, parallelId]);

  if (coursesError) return <ErrorState title={coursesError} />;
  if (!courses) return <Spinner />;
  if (courses.length === 0) return <EmptyState title="No tienes un curso asignado como animador." />;
  const current = courses.find((c) => c.id === parallelId);

  return (
    <div>
      <h1 className="mb-1 text-2xl">Reporte del curso</h1>
      <p className="mb-6 text-sm text-ink-soft">Tutorías de {current ? courseLabel(current) : 'tu curso'} únicamente.</p>

      <Card className="mb-6">
        <CardBody className="flex flex-wrap items-end gap-3">
          {courses.length > 1 && (
            <Select label="Curso" value={parallelId} onChange={(e) => setParallelId(e.target.value)}>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {courseLabel(c)}
                </option>
              ))}
            </Select>
          )}
          <Input type="date" label="Desde" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" label="Hasta" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button
            variant="secondary"
            disabled={!parallelId}
            onClick={() => downloadFile(`/reports/export.csv?${query}`, `reporte-${current ? courseLabel(current).replace(/\W+/g, '-') : 'curso'}.csv`)}
          >
            Descargar CSV (Excel)
          </Button>
        </CardBody>
      </Card>

      {/* Registro por alumno de SU curso: el servidor fuerza el paralelo del animador. */}
      <div className="mb-8">
        <StudentRegistryReport query={query} />
      </div>

      {error && <ErrorState title="No se pudo generar el reporte." />}
      {!error && !data && <Spinner />}
      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              ['Tutorías', data.summary.totalSessions],
              ['Atenciones con asistencia', data.summary.studentsAttended],
              ['Inasistencias', data.summary.absences],
              ['Justificadas', data.summary.justified],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardBody>
                  <div className="font-mono text-2xl font-medium">{value}</div>
                  <div className="text-xs text-ink-soft">{label}</div>
                </CardBody>
              </Card>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <span className="text-sm font-medium">Tutorías por mes</span>
              </CardHeader>
              <CardBody>
                <Bars items={data.months.map((m) => ({ label: m.label, count: m.count }))} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <span className="text-sm font-medium">Tutorías por materia</span>
              </CardHeader>
              <CardBody>
                <Bars items={data.subjects.map((s) => ({ label: s.name, count: s.count }))} />
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

export default function AnimatorReportPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Report />
    </Suspense>
  );
}
