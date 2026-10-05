'use client';

import { useEffect, useState } from 'react';
import { api, downloadFile } from '@/lib/api';
import { StudentRegistryReport } from '@/components/StudentRegistryReport';
import type {
  AcademicPeriod,
  Level,
  ReportBucket,
  ReportMonthBucket,
  ReportSummary,
  Subject,
  Teacher,
} from '@/lib/types';
import { fullName } from '@/lib/format';
import { Card, CardBody } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';

interface Filters {
  academicPeriodId: string;
  teacherId: string;
  subjectId: string;
  levelId: string;
  parallelId: string;
}

function toQuery(filters: Filters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  return params.toString();
}

export default function ReportsPage() {
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [filters, setFilters] = useState<Filters>({
    academicPeriodId: '',
    teacherId: '',
    subjectId: '',
    levelId: '',
    parallelId: '',
  });
  // Resumen general o Registro de tutorías por alumno (pedido 2026-10-02).
  const [view, setView] = useState<'summary' | 'registry'>('summary');

  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [byMonth, setByMonth] = useState<ReportMonthBucket[] | null>(null);
  const [bySubject, setBySubject] = useState<ReportBucket[] | null>(null);
  const [byTeacher, setByTeacher] = useState<ReportBucket[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get<AcademicPeriod[]>('/academic/periods').then(setPeriods);
    api.get<Teacher[]>('/teachers').then(setTeachers);
    api.get<Subject[]>('/academic/subjects').then(setSubjects);
    api.get<Level[]>('/academic/levels').then(setLevels);
  }, []);

  useEffect(() => {
    const query = toQuery(filters);
    setError(false);
    Promise.all([
      api.get<ReportSummary>(`/reports/summary?${query}`),
      api.get<ReportMonthBucket[]>(`/reports/by-month?${query}`),
      api.get<ReportBucket[]>(`/reports/by-subject?${query}`),
      api.get<ReportBucket[]>(`/reports/by-teacher?${query}`),
    ])
      .then(([s, m, subj, t]) => {
        setSummary(s);
        setByMonth(m);
        setBySubject(subj);
        setByTeacher(t);
      })
      .catch(() => setError(true));
  }, [filters]);

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function handleExport() {
    await downloadFile(`/reports/export.csv?${toQuery(filters)}`, 'reporte-tutorias.csv');
  }

  const kpis = summary
    ? [
        { label: 'Total de tutorías', value: summary.totalSessions },
        { label: 'Estudiantes atendidos', value: summary.studentsAttended },
        { label: 'Inasistencias', value: summary.absences },
        { label: 'Canceladas', value: summary.cancelledSessions },
      ]
    : [];

  const maxMonth = Math.max(1, ...(byMonth ?? []).map((b) => b.count));
  const maxSubject = Math.max(1, ...(bySubject ?? []).map((b) => b.count));
  const maxTeacher = Math.max(1, ...(byTeacher ?? []).map((b) => b.count));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl">Reportes</h1>
        <Button variant="secondary" onClick={handleExport}>
          Exportar CSV
        </Button>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <Select
          label="Período"
          value={filters.academicPeriodId}
          onChange={(e) => updateFilter('academicPeriodId', e.target.value)}
        >
          <option value="">Todos</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select label="Docente" value={filters.teacherId} onChange={(e) => updateFilter('teacherId', e.target.value)}>
          <option value="">Todos</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {fullName(t)}
            </option>
          ))}
        </Select>
        <Select
          label="Materia"
          value={filters.subjectId}
          onChange={(e) => updateFilter('subjectId', e.target.value)}
        >
          <option value="">Todas</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          label="Nivel"
          value={filters.levelId}
          onChange={(e) => setFilters((f) => ({ ...f, levelId: e.target.value, parallelId: '' }))}
        >
          <option value="">Todos</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Select
          label="Paralelo"
          value={filters.parallelId}
          disabled={!filters.levelId}
          onChange={(e) => updateFilter('parallelId', e.target.value)}
        >
          <option value="">Todos</option>
          {[...(levels.find((l) => l.id === filters.levelId)?.parallels ?? [])]
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </Select>
      </div>

      <div className="mb-6 inline-flex rounded-md border border-line bg-white p-0.5 text-sm" role="tablist">
        {(
          [
            ['summary', 'Resumen general'],
            ['registry', 'Registro de tutorías por alumno'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`rounded px-3 py-1.5 ${view === v ? 'bg-accent-tint font-medium text-accent-ink' : 'text-ink-soft hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'registry' && <StudentRegistryReport query={toQuery(filters)} />}

      {view === 'summary' && error && <ErrorState title="No se pudo generar el reporte" />}
      {view === 'summary' && !error && !summary && <Spinner />}

      {view === 'summary' && !error && summary && (
        <>
          {summary.totalSessions === 0 ? (
            <EmptyState title="No hay datos para los filtros seleccionados." />
          ) : (
            <>
              <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
                {kpis.map((kpi) => (
                  <Card key={kpi.label}>
                    <CardBody>
                      <div className="font-mono text-2xl font-medium text-ink">{kpi.value}</div>
                      <div className="text-xs text-ink-soft">{kpi.label}</div>
                    </CardBody>
                  </Card>
                ))}
              </div>
              {summary.topSubject && (
                <p className="mb-6 text-sm text-ink-soft">
                  Materia con mayor demanda:{' '}
                  <span className="font-medium text-ink">
                    {summary.topSubject.name} ({summary.topSubject.count})
                  </span>
                </p>
              )}

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <Card>
                  <CardBody>
                    <h3 className="mb-4 text-sm font-medium">Tutorías por mes</h3>
                    <div className="flex h-40 items-end gap-3">
                      {(byMonth ?? []).map((b) => (
                        <div key={b.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                          <div
                            className="w-full rounded-t-md bg-accent"
                            style={{ height: Math.max(4, Math.round((b.count / maxMonth) * 130)) }}
                            title={`${b.label}: ${b.count}`}
                          />
                          <span className="font-mono text-[10px] text-ink-soft">{b.label}</span>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardBody>
                    <h3 className="mb-4 text-sm font-medium">Por materia</h3>
                    <div className="flex flex-col gap-2">
                      {(bySubject ?? []).map((b) => (
                        <div key={b.name} className="flex items-center gap-2 text-sm">
                          <span className="w-28 truncate text-ink-soft">{b.name}</span>
                          <div className="h-3 flex-1 rounded-full bg-paper">
                            <div
                              className="h-3 rounded-full bg-accent"
                              style={{ width: `${(b.count / maxSubject) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs">{b.count}</span>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>

                <Card className="md:col-span-2">
                  <CardBody>
                    <h3 className="mb-4 text-sm font-medium">Por docente</h3>
                    <div className="flex flex-col gap-2">
                      {(byTeacher ?? []).map((b) => (
                        <div key={b.name} className="flex items-center gap-2 text-sm">
                          <span className="w-40 truncate text-ink-soft">{b.name}</span>
                          <div className="h-3 flex-1 rounded-full bg-paper">
                            <div
                              className="h-3 rounded-full bg-status-scheduled"
                              style={{ width: `${(b.count / maxTeacher) * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs">{b.count}</span>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
