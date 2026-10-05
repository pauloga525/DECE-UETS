'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, downloadFile } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';

interface RegistryRow {
  studentId: string;
  name: string;
  identification: string;
  level: string;
  parallel: string;
  counts: Record<string, number>;
  total: number;
}
interface Registry {
  count: 'scheduled' | 'attended';
  subjects: string[];
  rows: RegistryRow[];
  totals: { bySubject: Record<string, number>; total: number; students: number };
}

const PAGE_SIZE = 25;
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Registro de tutorías por alumno (pedido 2026-10-02): una fila por alumno, una columna por
 * materia con la cantidad de tutorías del período, y el total de todas las materias.
 * `query` son los filtros del reporte (período, nivel, paralelo, fechas…) ya en formato URL.
 */
export function StudentRegistryReport({ query }: { query: string }) {
  const [count, setCount] = useState<'scheduled' | 'attended'>('scheduled');
  const [data, setData] = useState<Registry | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const fullQuery = [query, `count=${count}`].filter(Boolean).join('&');

  useEffect(() => {
    setData(null);
    setError(false);
    setPage(0);
    api
      .get<Registry>(`/reports/students-registry?${fullQuery}`)
      .then(setData)
      .catch(() => setError(true));
  }, [fullQuery]);

  const filtered = useMemo(() => {
    const words = normalize(search).split(/\s+/).filter(Boolean);
    if (!data) return [];
    if (!words.length) return data.rows;
    return data.rows.filter((r) => {
      const hay = normalize(`${r.name} ${r.identification} ${r.level} ${r.parallel}`);
      return words.every((w) => hay.includes(w));
    });
  }, [data, search]);

  useEffect(() => setPage(0), [search]);

  async function download() {
    setDownloading(true);
    try {
      await downloadFile(`/reports/students-registry.xlsx?${fullQuery}`, 'registro-tutorias.xlsx');
    } finally {
      setDownloading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg">Registro de tutorías por alumno</h2>
          <p className="text-sm text-ink-soft">Cantidad de tutorías de cada alumno por materia y el total del período.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-line bg-white p-0.5 text-sm" role="tablist" aria-label="Qué contar">
            {(
              [
                ['scheduled', 'Asignadas'],
                ['attended', 'Solo asistidas'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                role="tab"
                aria-selected={count === v}
                onClick={() => setCount(v)}
                className={`rounded px-3 py-1 ${count === v ? 'bg-accent-tint font-medium text-accent-ink' : 'text-ink-soft hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button variant="secondary" disabled={!data || downloading} onClick={download}>
            {downloading ? 'Generando…' : 'Descargar Excel'}
          </Button>
        </div>
      </div>

      {error && <ErrorState title="No se pudo generar el registro." />}
      {!error && !data && <Spinner />}
      {data && data.rows.length === 0 && <EmptyState title="No hay tutorías registradas con estos filtros." />}

      {data && data.rows.length > 0 && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card className="p-3">
              <div className="font-mono text-xl">{data.totals.students}</div>
              <div className="text-xs text-ink-soft">Alumnos con tutorías</div>
            </Card>
            <Card className="p-3">
              <div className="font-mono text-xl">{data.totals.total}</div>
              <div className="text-xs text-ink-soft">{count === 'attended' ? 'Tutorías asistidas' : 'Tutorías asignadas'} (todas las materias)</div>
            </Card>
            <Card className="p-3">
              <div className="font-mono text-xl">{data.subjects.length}</div>
              <div className="text-xs text-ink-soft">Materias</div>
            </Card>
            <Card className="p-3">
              <div className="font-mono text-xl">{(data.totals.total / Math.max(1, data.totals.students)).toFixed(1)}</div>
              <div className="text-xs text-ink-soft">Promedio por alumno</div>
            </Card>
          </div>

          <input
            type="search"
            aria-label="Buscar alumno en el registro"
            placeholder="Buscar alumno, cédula o curso…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-3 w-full max-w-sm rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                    <th className="sticky left-0 bg-white px-3 py-2">Alumno</th>
                    <th className="px-3 py-2">Curso</th>
                    {data.subjects.map((s) => (
                      <th key={s} className="px-3 py-2 text-center normal-case">
                        {s}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pageRows.map((r) => (
                    <tr key={r.studentId} className="hover:bg-paper">
                      <td className="sticky left-0 bg-white px-3 py-2">
                        <div className="font-medium">{r.name}</div>
                        <div className="font-mono text-xs text-ink-soft">{r.identification}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-ink-soft">
                        {r.level} &ldquo;{r.parallel}&rdquo;
                      </td>
                      {data.subjects.map((s) => (
                        <td key={s} className={`px-3 py-2 text-center font-mono ${r.counts[s] ? '' : 'text-line'}`}>
                          {r.counts[s] ?? 0}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-mono font-semibold text-accent-ink">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line bg-paper font-semibold">
                    <td className="sticky left-0 bg-paper px-3 py-2">Total ({data.totals.students} alumnos)</td>
                    <td />
                    {data.subjects.map((s) => (
                      <td key={s} className="px-3 py-2 text-center font-mono">
                        {data.totals.bySubject[s]}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center font-mono text-accent-ink">{data.totals.total}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <div className="mt-2 flex items-center justify-between text-xs text-ink-soft">
            <span>
              {filtered.length === 0
                ? 'Sin coincidencias'
                : `${current * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE + PAGE_SIZE, filtered.length)} de ${filtered.length} alumnos`}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(current - 1)} disabled={current === 0} className="rounded-md border border-line px-2.5 py-1 hover:border-accent disabled:opacity-40">
                  ‹ Anterior
                </button>
                <span className="px-2 font-mono">
                  {current + 1}/{totalPages}
                </span>
                <button onClick={() => setPage(current + 1)} disabled={current >= totalPages - 1} className="rounded-md border border-line px-2.5 py-1 hover:border-accent disabled:opacity-40">
                  Siguiente ›
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
