'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, downloadFile } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';

type Status = 'COMPLETE' | 'PARTIAL' | 'NONE';
interface Row {
  teacherId: string;
  teacher: string;
  email: string;
  subjectId: string;
  subject: string;
  status: Status;
  levels: { level: string; parallels: string[]; covered: boolean }[];
  rules: number;
  weeklyMinutes: number;
}
interface SubjectRow {
  subjectId: string;
  subject: string;
  teachers: number;
  complete: number;
  partial: number;
  none: number;
}
interface Data {
  subjects: SubjectRow[];
  rows: Row[];
  totals: { subjects: number; subjectsComplete: number; teachers: number; teachersComplete: number };
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  COMPLETE: { label: 'Completo', cls: 'bg-accent-tint text-accent-ink' },
  PARTIAL: { label: 'Parcial', cls: 'bg-status-warning-tint text-status-warning' },
  NONE: { label: 'Sin horario', cls: 'bg-status-danger-tint text-status-danger' },
};
type Filter = 'all' | 'pending' | Status;
type Include = 'all' | 'pending' | 'complete';
const FILTERS: { key: Filter; label: string; test: (r: Row) => boolean }[] = [
  { key: 'pending', label: 'Pendientes', test: (r) => r.status !== 'COMPLETE' },
  { key: 'NONE', label: 'Sin horario', test: (r) => r.status === 'NONE' },
  { key: 'PARTIAL', label: 'Parcial', test: (r) => r.status === 'PARTIAL' },
  { key: 'COMPLETE', label: 'Completo', test: (r) => r.status === 'COMPLETE' },
  { key: 'all', label: 'Todos', test: () => true },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtLevel = (l: Row['levels'][number]) => (l.parallels.length ? `${l.level} (${l.parallels.join(', ')})` : l.level);

/**
 * Horarios de docentes (pedido 2026-10-13): por materia, qué docentes ya declararon su horario
 * de tutorías. Solo administrador y coordinador (el servidor lo restringe).
 */
export function ScheduleComplianceReport({ academicPeriodId }: { academicPeriodId?: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [filter, setFilter] = useState<Filter>('pending');
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState<'pdf' | 'xlsx' | null>(null);
  const [include, setInclude] = useState<Include>('all');
  const query = academicPeriodId ? `?academicPeriodId=${academicPeriodId}` : '';

  async function download(kind: 'pdf' | 'xlsx') {
    const params = new URLSearchParams({
      include,
      ...(subjectId ? { subjectId } : {}),
      ...(academicPeriodId ? { academicPeriodId } : {}),
    });
    const subject = data?.subjects.find((s) => s.subjectId === subjectId)?.subject;
    const slug = subject ? subject.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() : 'todas';
    setDownloading(kind);
    try {
      await downloadFile(`/reports/schedule-compliance.${kind}?${params}`, `horarios-docentes-${slug}.${kind}`);
    } finally {
      setDownloading(null);
    }
  }

  useEffect(() => {
    setData(null);
    setError(false);
    api
      .get<Data>(`/reports/schedule-compliance${query}`)
      .then(setData)
      .catch(() => setError(true));
  }, [query]);

  const subjectsSorted = useMemo(
    // Primero las materias con más docentes pendientes.
    () => [...(data?.subjects ?? [])].sort((a, b) => b.partial + b.none - (a.partial + a.none) || a.subject.localeCompare(b.subject, 'es')),
    [data],
  );
  const filtered = useMemo(() => {
    const test = FILTERS.find((f) => f.key === filter)!.test;
    const q = norm(search.trim());
    return (data?.rows ?? []).filter(
      (r) => (!subjectId || r.subjectId === subjectId) && test(r) && (!q || norm(`${r.teacher} ${r.email} ${r.subject}`).includes(q)),
    );
  }, [data, subjectId, filter, search]);
  const pgSubjects = usePagination(subjectsSorted, 10);
  const pgRows = usePagination(filtered, 20, `${subjectId}|${filter}|${search}`);

  if (error) return <ErrorState title="No se pudo generar el reporte de horarios." />;
  if (!data) return <Spinner />;
  if (data.rows.length === 0) return <EmptyState title="No hay docentes con materias asignadas en este período." />;

  const selected = data.subjects.find((s) => s.subjectId === subjectId);
  // Base de los contadores de los filtros: materia elegida + búsqueda.
  const q = norm(search.trim());
  const scope = data.rows.filter(
    (r) => (!subjectId || r.subjectId === subjectId) && (!q || norm(`${r.teacher} ${r.email} ${r.subject}`).includes(q)),
  );

  return (
    <div>
      <p className="mb-4 max-w-3xl text-sm text-ink-soft">
        Revisa si los docentes de cada materia ya declararon su horario de tutorías en <i>Mi horario</i>. Un nivel cuenta como
        cubierto si tiene un horario activo (propio o compartido con otra especialidad del mismo curso).
      </p>

      {/* Exportación (pedido 2026-10-14): una materia o todas; docentes que faltan y/o que ya cargaron. */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Select label="Materia" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Todas las materias</option>
            {[...data.subjects]
              .sort((a, b) => a.subject.localeCompare(b.subject, 'es'))
              .map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.subject}
                </option>
              ))}
          </Select>
          <Select label="Incluir" value={include} onChange={(e) => setInclude(e.target.value as Include)}>
            <option value="all">Faltan y ya cargaron</option>
            <option value="pending">Solo los que faltan</option>
            <option value="complete">Solo los que ya cargaron</option>
          </Select>
          <Button disabled={!!downloading} onClick={() => download('pdf')}>
            {downloading === 'pdf' ? 'Generando PDF…' : 'Descargar PDF'}
          </Button>
          <Button variant="secondary" disabled={!!downloading} onClick={() => download('xlsx')}>
            {downloading === 'xlsx' ? 'Descargando…' : 'Descargar Excel'}
          </Button>
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Docentes al día" value={`${data.totals.teachersComplete} / ${data.totals.teachers}`} hint="horario completo en todas sus materias" />
        <Kpi
          label="Docentes con pendientes"
          value={data.totals.teachers - data.totals.teachersComplete}
          tone={data.totals.teachers - data.totals.teachersComplete ? 'warning' : undefined}
        />
        <Kpi label="Materias completas" value={`${data.totals.subjectsComplete} / ${data.totals.subjects}`} hint="todos sus docentes con horario" />
        <Kpi
          label="Avance general"
          value={`${Math.round((data.rows.filter((r) => r.status === 'COMPLETE').length / data.rows.length) * 100)}%`}
          hint="docente-materia con horario completo"
        />
      </div>

      <h3 className="mb-2 text-base">Por materia</h3>
      <Card className="mb-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                <th className="px-4 py-2">Materia</th>
                <th className="px-4 py-2 text-center">Docentes</th>
                <th className="px-4 py-2 text-center">Completo</th>
                <th className="px-4 py-2 text-center">Parcial</th>
                <th className="px-4 py-2 text-center">Sin horario</th>
                <th className="px-4 py-2">Avance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pgSubjects.pageItems.map((s) => {
                const pct = Math.round((s.complete / s.teachers) * 100);
                const active = s.subjectId === subjectId;
                return (
                  <tr
                    key={s.subjectId}
                    onClick={() => setSubjectId(active ? '' : s.subjectId)}
                    className={`cursor-pointer ${active ? 'bg-accent-tint' : 'hover:bg-paper'}`}
                    title="Ver los docentes de esta materia"
                  >
                    <td className="px-4 py-2 font-medium">{s.subject}</td>
                    <td className="px-4 py-2 text-center font-mono">{s.teachers}</td>
                    <td className="px-4 py-2 text-center font-mono text-accent-ink">{s.complete}</td>
                    <td className={`px-4 py-2 text-center font-mono ${s.partial ? 'text-status-warning' : ''}`}>{s.partial}</td>
                    <td className={`px-4 py-2 text-center font-mono ${s.none ? 'font-medium text-status-danger' : ''}`}>{s.none}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-line">
                          <div className={`h-full ${pct === 100 ? 'bg-accent' : 'bg-status-warning'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="font-mono text-xs text-ink-soft">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Pagination {...pgSubjects} className="mb-6" />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base">
          Docentes {selected ? <span className="text-accent-ink">· {selected.subject}</span> : '· todas las materias'}
          {selected && (
            <button onClick={() => setSubjectId('')} className="ml-2 text-xs font-normal text-ink-soft underline">
              ver todas
            </button>
          )}
        </h3>
        <input
          type="search"
          placeholder="Buscar docente o materia…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === f.key ? 'border-accent bg-accent-tint text-accent-ink' : 'border-line text-ink-soft hover:border-accent'
            }`}
          >
            {f.label} ({scope.filter(f.test).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={filter === 'pending' ? '¡Todos los docentes de esta selección ya declararon su horario!' : 'Ningún docente coincide.'} />
      ) : (
        <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                    <th className="px-4 py-2">Docente</th>
                    <th className="px-4 py-2">Materia</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2">Niveles sin horario</th>
                    <th className="px-4 py-2 text-center">Horarios</th>
                    <th className="px-4 py-2 text-center">Min/semana</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pgRows.pageItems.map((r) => (
                    <tr key={`${r.teacherId}-${r.subjectId}`} className="align-top hover:bg-paper">
                      <td className="px-4 py-2">
                        <Link href={`/docentes/${r.teacherId}`} className="font-medium text-accent-ink">
                          {r.teacher}
                        </Link>
                        <div className="text-xs text-ink-soft">{r.email}</div>
                      </td>
                      <td className="px-4 py-2 text-ink-soft">{r.subject}</td>
                      <td className="px-4 py-2">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {r.levels.filter((l) => !l.covered).length === 0 ? (
                          <span className="text-ink-soft">—</span>
                        ) : (
                          <ul className="space-y-0.5 text-status-danger">
                            {r.levels.filter((l) => !l.covered).map((l) => (
                              <li key={l.level}>{fmtLevel(l)}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center font-mono">{r.rules}</td>
                      <td className="px-4 py-2 text-center font-mono">{r.weeklyMinutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination {...pgRows} />
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: 'warning' }) {
  return (
    <div className="rounded-lg border border-line bg-white px-4 py-3">
      <div className="text-xs text-ink-soft">{label}</div>
      <div className={`font-mono text-2xl font-medium ${tone === 'warning' ? 'text-status-warning' : 'text-ink'}`}>{value}</div>
      {hint && <div className="text-[11px] text-ink-soft">{hint}</div>}
    </div>
  );
}
