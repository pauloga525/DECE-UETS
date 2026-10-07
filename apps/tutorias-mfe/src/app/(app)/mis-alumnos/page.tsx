'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';

import { Pagination, usePagination } from '@/components/ui/Pagination';
interface MyStudent {
  id: string;
  firstName: string;
  lastName: string;
  identification: string;
  parallel: { id: string; name: string };
  assignmentId: string;
  subject: string;
  level: string;
  total: number;
  attended: number;
  absent: number;
  pending: number;
}

/**
 * Docente: los alumnos de los paralelos donde dicta cada materia, filtrables por materia,
 * nivel y paralelo, con sus tutorías CON ÉL (pedido 2026-10-05). Los alumnos que anima como
 * animador están en "Mi curso (animador)", no aquí.
 */
export default function MyStudentsPage() {
  useRequireAuth(['TEACHER']);
  const [rows, setRows] = useState<MyStudent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [level, setLevel] = useState('');
  const [parallel, setParallel] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api
      .get<MyStudent[]>('/teachers/me/students')
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus alumnos'));
  }, []);

  const options = useMemo(() => {
    const all = rows ?? [];
    const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    const bySubject = all.filter((r) => !subject || r.subject === subject);
    const byLevel = bySubject.filter((r) => !level || r.level === level);
    return {
      subjects: uniq(all.map((r) => r.subject)),
      levels: uniq(bySubject.map((r) => r.level)),
      parallels: uniq(byLevel.map((r) => r.parallel.name)),
    };
  }, [rows, subject, level]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (!subject || r.subject === subject) &&
        (!level || r.level === level) &&
        (!parallel || r.parallel.name === parallel) &&
        (!q || `${r.firstName} ${r.lastName} ${r.identification}`.toLowerCase().includes(q)),
    );
  }, [rows, subject, level, parallel, search]);

  const pg = usePagination(filtered, 25);

  if (error) return <ErrorState title={error} />;
  if (!rows) return <Spinner />;

  return (
    <div>
      <h1 className="mb-1 text-2xl">Mis alumnos</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Alumnos de los paralelos donde dictas cada materia, con sus tutorías contigo. Puedes crear tutorías para ellos desde
        &ldquo;Crear tutoría&rdquo;.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Select
          label="Materia"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setLevel('');
            setParallel('');
          }}
        >
          <option value="">Todas</option>
          {options.subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
        <Select
          label="Nivel"
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            setParallel('');
          }}
        >
          <option value="">Todos</option>
          {options.levels.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </Select>
        <Select label="Paralelo" value={parallel} onChange={(e) => setParallel(e.target.value)}>
          <option value="">Todos</option>
          {options.parallels.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
        <div className="w-full max-w-xs">
          <Input placeholder="Buscar alumno…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="pb-2 text-xs text-ink-soft">{filtered.length} filas</span>
      </div>

      {rows.length === 0 && <EmptyState title="No tienes materias asignadas todavía. Pide al DECE que registre tus asignaciones." />}
      {rows.length > 0 && filtered.length === 0 && <EmptyState title="Ningún alumno coincide con los filtros." />}
      {filtered.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                  <th className="px-4 py-2">Alumno</th>
                  <th className="px-4 py-2">Materia</th>
                  <th className="px-4 py-2">Nivel</th>
                  <th className="px-4 py-2 text-center">Paralelo</th>
                  <th className="px-4 py-2 text-center">Tutorías</th>
                  <th className="px-4 py-2 text-center">Pendientes</th>
                  <th className="px-4 py-2 text-center">Asistió</th>
                  <th className="px-4 py-2 text-center">Faltas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pg.pageItems.map((r) => (
                  <tr key={`${r.assignmentId}-${r.id}`} className="hover:bg-paper">
                    <td className="px-4 py-2">
                      <Link href={`/estudiantes/${r.id}`} className="font-medium text-accent-ink">
                        {r.lastName} {r.firstName}
                      </Link>
                      <div className="font-mono text-xs text-ink-soft">{r.identification}</div>
                    </td>
                    <td className="px-4 py-2">{r.subject}</td>
                    <td className="px-4 py-2 text-ink-soft">{r.level}</td>
                    <td className="px-4 py-2 text-center font-mono">{r.parallel.name}</td>
                    <td className="px-4 py-2 text-center font-mono">{r.total}</td>
                    <td className={`px-4 py-2 text-center font-mono ${r.pending ? 'font-medium text-status-warning' : ''}`}>{r.pending}</td>
                    <td className="px-4 py-2 text-center font-mono text-accent-ink">{r.attended}</td>
                    <td className={`px-4 py-2 text-center font-mono ${r.absent ? 'font-medium text-status-danger' : ''}`}>{r.absent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Pagination {...pg} />
    </div>
  );
}
