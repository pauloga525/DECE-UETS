'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, downloadFile } from '@/lib/api';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';
import { Pagination, usePagination } from '@/components/ui/Pagination';

type Kind = 'NOT_HELD' | 'NOT_CLOSED' | 'CANCELLED';
const KIND_LABEL: Record<Kind, string> = {
  NOT_HELD: 'No realizada',
  NOT_CLOSED: 'No finalizada por el docente',
  CANCELLED: 'Cancelada',
};
const KIND_HELP: Record<Kind, string> = {
  NOT_HELD: 'Estaba programada y nunca se inició; el sistema la cerró al vencer el bloque.',
  NOT_CLOSED: 'Se inició pero el docente no la finalizó; la cerró el sistema.',
  CANCELLED: 'Cancelada, con su motivo.',
};
const KIND_CLASS: Record<Kind, string> = {
  NOT_HELD: 'text-status-danger',
  NOT_CLOSED: 'text-status-warning',
  CANCELLED: 'text-ink-soft',
};

interface Row {
  id: string;
  kind: Kind;
  date: string;
  startTime: string;
  endTime: string;
  teacher: string;
  teacherEmail: string;
  subject: string;
  level: string;
  parallels: string[];
  students: number;
  location: string | null;
  reportPending: boolean;
  cancelReason: string | null;
  cancelledBy: string | null;
}
interface Data {
  rows: Row[];
  totals: Record<Kind, number>;
  total: number;
  reportsPending: number;
  byTeacher: { teacher: string; email: string; counts: Record<Kind, number>; total: number }[];
}

const fmtDate = (d: string) =>
  new Intl.DateTimeFormat('es-EC', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(d),
  );

/**
 * Tutorías no realizadas o no completadas (pedido 2026-11-24): las que nunca se iniciaron, las que
 * el docente no finalizó (las cerró el sistema) y las canceladas. `query` son los filtros comunes
 * del reporte (período, docente, materia, nivel, paralelo).
 */
export function UnfulfilledReport({ query }: { query: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<Kind | ''>('');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState<'xlsx' | 'pdf' | null>(null);

  const fullQuery = [query, from && `from=${from}`, to && `to=${to}`, kind && `kind=${kind}`].filter(Boolean).join('&');

  useEffect(() => {
    // Ignora respuestas viejas si los filtros cambian antes de que llegue la anterior.
    let stale = false;
    setData(null);
    setError(false);
    api
      .get<Data>(`/reports/unfulfilled?${fullQuery}`)
      .then((d) => !stale && setData(d))
      .catch(() => !stale && setError(true));
    return () => {
      stale = true;
    };
  }, [fullQuery]);

  async function download(type: 'xlsx' | 'pdf') {
    setDownloading(type);
    try {
      await downloadFile(`/reports/unfulfilled.${type}?${fullQuery}`, `tutorias-no-realizadas.${type}`);
    } finally {
      setDownloading(null);
    }
  }

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const pg = usePagination(rows, 25);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input label="Desde" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="Hasta" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Select label="Estado" value={kind} onChange={(e) => setKind(e.target.value as Kind | '')}>
          <option value="">Todos</option>
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </Select>
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
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            {(
              [
                ['Total', data.total, 'text-ink'],
                [KIND_LABEL.NOT_HELD, data.totals.NOT_HELD, 'text-status-danger'],
                [KIND_LABEL.NOT_CLOSED, data.totals.NOT_CLOSED, 'text-status-warning'],
                ['Informes pendientes', data.reportsPending, 'text-status-warning'],
                [KIND_LABEL.CANCELLED, data.totals.CANCELLED, 'text-ink-soft'],
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
          <ul className="mb-6 flex flex-col gap-0.5 text-xs text-ink-soft">
            {(Object.keys(KIND_HELP) as Kind[]).map((k) => (
              <li key={k}>
                <span className={`font-medium ${KIND_CLASS[k]}`}>{KIND_LABEL[k]}:</span> {KIND_HELP[k]}
              </li>
            ))}
          </ul>

          {data.total === 0 ? (
            <EmptyState title="No hay tutorías no realizadas ni no completadas con estos filtros." />
          ) : (
            <>
              <h3 className="mb-2 text-sm font-medium">Por docente</h3>
              <Card className="mb-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                      <tr className="border-b border-line">
                        <th className="px-4 py-2 text-left">Docente</th>
                        <th className="px-4 py-2 text-center">No realizadas</th>
                        <th className="px-4 py-2 text-center">No finalizadas</th>
                        <th className="px-4 py-2 text-center">Canceladas</th>
                        <th className="px-4 py-2 text-center">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.byTeacher.map((t) => (
                        <tr key={t.email}>
                          <td className="px-4 py-2">
                            <div className="font-medium">{t.teacher}</div>
                            <div className="text-xs text-ink-soft">{t.email}</div>
                          </td>
                          <td className={`px-4 py-2 text-center font-mono ${t.counts.NOT_HELD ? 'text-status-danger' : ''}`}>
                            {t.counts.NOT_HELD}
                          </td>
                          <td className={`px-4 py-2 text-center font-mono ${t.counts.NOT_CLOSED ? 'text-status-warning' : ''}`}>
                            {t.counts.NOT_CLOSED}
                          </td>
                          <td className="px-4 py-2 text-center font-mono">{t.counts.CANCELLED}</td>
                          <td className="px-4 py-2 text-center font-mono font-medium">{t.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <h3 className="mb-2 text-sm font-medium">Detalle ({data.total})</h3>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                      <tr className="border-b border-line">
                        <th className="px-4 py-2 text-left">Fecha</th>
                        <th className="px-4 py-2 text-left">Estado</th>
                        <th className="px-4 py-2 text-left">Docente</th>
                        <th className="px-4 py-2 text-left">Materia · Curso</th>
                        <th className="px-4 py-2 text-center">Alumnos</th>
                        <th className="px-4 py-2 text-left">Detalle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {pg.pageItems.map((r) => (
                        <tr key={r.id} className="hover:bg-paper">
                          <td className="px-4 py-2">
                            <Link href={`/sesiones/${r.id}`} className="block">
                              <span className="block text-xs capitalize text-ink-soft">{fmtDate(r.date)}</span>
                              <span className="font-mono">
                                {r.startTime}–{r.endTime}
                              </span>
                            </Link>
                          </td>
                          <td className={`px-4 py-2 font-medium ${KIND_CLASS[r.kind]}`}>{KIND_LABEL[r.kind]}</td>
                          <td className="px-4 py-2">{r.teacher}</td>
                          <td className="px-4 py-2">
                            {r.subject}
                            <span className="block text-xs text-ink-soft">
                              {r.level}
                              {r.parallels.length ? ` · ${r.parallels.join(', ')}` : ''}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center font-mono">{r.students}</td>
                          <td className="px-4 py-2 text-xs text-ink-soft">
                            {r.kind === 'CANCELLED'
                              ? `${r.cancelReason ?? 'Sin motivo'}${r.cancelledBy ? ` · ${r.cancelledBy}` : ''}`
                              : r.kind === 'NOT_CLOSED'
                                ? r.reportPending
                                  ? 'Informe pendiente'
                                  : 'Informe entregado después'
                                : 'Nunca se inició'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Pagination {...pg} />
            </>
          )}
        </>
      )}
    </div>
  );
}
