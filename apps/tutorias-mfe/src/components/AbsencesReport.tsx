'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, downloadFile } from '@/lib/api';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';
import { Pagination, usePagination } from '@/components/ui/Pagination';

interface Row {
  enrollmentId: string;
  sessionId: string;
  student: string;
  identification: string;
  level: string;
  parallel: string;
  subject: string;
  teacher: string;
  date: string;
  startTime: string;
  endTime: string;
  justified: boolean;
  note: string | null;
  automatic: boolean;
}
interface Data {
  rows: Row[];
  total: number;
  students: number;
  withNote: number;
  automatic: number;
  byStudent: { student: string; identification: string; course: string; absences: number; withNote: number }[];
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtDate = (d: string) =>
  new Intl.DateTimeFormat('es-EC', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(d),
  );

/**
 * Inasistencias de estudiantes (pedido 2026-11-24): quién no asistió a una tutoría que sí se dio,
 * con materia, docente, fecha y la observación que anotó el docente al tomar lista.
 * `query` son los filtros comunes del reporte (período, docente, materia, nivel, paralelo).
 */
export function AbsencesReport({ query }: { query: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState<'xlsx' | 'pdf' | null>(null);

  const fullQuery = [query, from && `from=${from}`, to && `to=${to}`].filter(Boolean).join('&');

  useEffect(() => {
    let stale = false;
    setData(null);
    setError(false);
    api
      .get<Data>(`/reports/absences?${fullQuery}`)
      .then((d) => !stale && setData(d))
      .catch(() => !stale && setError(true));
    return () => {
      stale = true;
    };
  }, [fullQuery]);

  async function download(type: 'xlsx' | 'pdf') {
    setDownloading(type);
    try {
      await downloadFile(`/reports/absences.${type}?${fullQuery}`, `inasistencias-estudiantes.${type}`);
    } finally {
      setDownloading(null);
    }
  }

  const rows = useMemo(() => {
    const words = normalize(search).split(/\s+/).filter(Boolean);
    return (data?.rows ?? []).filter((r) => {
      const hay = normalize(`${r.student} ${r.identification} ${r.subject} ${r.teacher}`);
      return words.every((w) => hay.includes(w));
    });
  }, [data, search]);
  const pg = usePagination(rows, 25);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input label="Desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input
          label="Buscar"
          placeholder="Estudiante, cédula, materia o docente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" disabled={!data?.total || !!downloading} onClick={() => download('xlsx')}>
            {downloading === 'xlsx' ? 'Generando…' : 'Excel'}
          </Button>
          <Button disabled={!data?.total || !!downloading} onClick={() => download('pdf')}>
            {downloading === 'pdf' ? 'Generando…' : 'PDF'}
          </Button>
        </div>
      </div>

      {error && <ErrorState title="No se pudo generar el reporte" />}
      {!error && !data && <Spinner />}
      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {(
              [
                ['Inasistencias', data.total, 'text-status-danger'],
                ['Estudiantes', data.students, 'text-ink'],
                ['Con observación del docente', data.withNote, 'text-ink'],
                ['Sin lista (marcadas por el sistema)', data.automatic, 'text-ink-soft'],
              ] as const
            ).map(([label, value, cls]) => (
              <Card key={label}>
                <CardBody>
                  <div className={`font-mono text-2xl font-medium ${cls}`}>{value}</div>
                  <div className="text-xs text-ink-soft">{label}</div>
                </CardBody>
              </Card>
            ))}
          </div>
          <p className="mb-6 text-xs text-ink-soft">
            Solo tutorías que sí se realizaron. &ldquo;Sin lista&rdquo;: el docente no tomó lista y el sistema marcó
            ausentes a los estudiantes al cerrar la tutoría.
          </p>

          {data.total === 0 ? (
            <EmptyState title="No hay inasistencias con estos filtros." />
          ) : (
            <>
              <h3 className="mb-2 text-sm font-medium">Detalle ({rows.length})</h3>
              <Card className="mb-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                      <tr className="border-b border-line">
                        <th className="px-4 py-2 text-left">Fecha</th>
                        <th className="px-4 py-2 text-left">Estudiante</th>
                        <th className="px-4 py-2 text-left">Materia</th>
                        <th className="px-4 py-2 text-left">Docente</th>
                        <th className="px-4 py-2 text-left">Observación del docente</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {pg.pageItems.map((r) => (
                        <tr key={r.enrollmentId} className="hover:bg-paper">
                          <td className="px-4 py-2">
                            <Link href={`/sesiones/${r.sessionId}`} className="block">
                              <span className="block text-xs capitalize text-ink-soft">{fmtDate(r.date)}</span>
                              <span className="font-mono">
                                {r.startTime}–{r.endTime}
                              </span>
                            </Link>
                          </td>
                          <td className="px-4 py-2">
                            <span className="font-medium">{r.student}</span>
                            <span className="block text-xs text-ink-soft">
                              {r.level} · {r.parallel}
                            </span>
                          </td>
                          <td className="px-4 py-2">{r.subject}</td>
                          <td className="px-4 py-2">{r.teacher}</td>
                          <td className="max-w-xs px-4 py-2 text-xs">
                            {r.justified && <span className="mr-1 font-medium text-accent-ink">Justificada.</span>}
                            {r.note ? (
                              <span className="whitespace-pre-line">{r.note}</span>
                            ) : (
                              <span className="italic text-ink-soft">
                                {r.automatic ? 'El docente no tomó lista' : 'Sin observación'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Pagination {...pg} />

              <h3 className="mb-2 mt-6 text-sm font-medium">Por estudiante</h3>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                      <tr className="border-b border-line">
                        <th className="px-4 py-2 text-left">Estudiante</th>
                        <th className="px-4 py-2 text-left">Curso</th>
                        <th className="px-4 py-2 text-center">Inasistencias</th>
                        <th className="px-4 py-2 text-center">Con observación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.byStudent.slice(0, 50).map((s) => (
                        <tr key={s.identification}>
                          <td className="px-4 py-2">
                            <span className="font-medium">{s.student}</span>
                            <span className="block font-mono text-xs text-ink-soft">{s.identification}</span>
                          </td>
                          <td className="px-4 py-2">{s.course}</td>
                          <td className="px-4 py-2 text-center font-mono text-status-danger">{s.absences}</td>
                          <td className="px-4 py-2 text-center font-mono">{s.withNote}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              {data.byStudent.length > 50 && (
                <p className="mt-2 text-xs text-ink-soft">
                  Se muestran los 50 estudiantes con más inasistencias; el Excel y el PDF traen la lista completa.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
