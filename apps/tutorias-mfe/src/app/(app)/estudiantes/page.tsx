'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { Level, Parallel, Student } from '@/lib/types';
import { fullName } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';
import { PencilIcon, TrashIcon } from '@/components/ui/icons';

export default function StudentsPage() {
  const { user } = useRequireAuth(['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST', 'TEACHER']);
  const isAdmin = user?.role === 'ADMIN';

  const [students, setStudents] = useState<Student[] | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  const [levels, setLevels] = useState<Level[]>([]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [identification, setIdentification] = useState('');
  const [levelId, setLevelId] = useState('');
  const [parallelId, setParallelId] = useState('');
  const [parallels, setParallels] = useState<Parallel[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<Student | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editLevelId, setEditLevelId] = useState('');
  const [editParallelId, setEditParallelId] = useState('');
  const [editParallels, setEditParallels] = useState<Parallel[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  function load(query: string) {
    api
      .get<Student[]>(`/students${query ? `?search=${encodeURIComponent(query)}` : ''}`)
      .then(setStudents)
      .catch(() => setError(true));
  }

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (isAdmin) api.get<Level[]>('/academic/levels').then(setLevels).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!levelId) {
      setParallels([]);
      setParallelId('');
      return;
    }
    api.get<Parallel[]>(`/academic/parallels?levelId=${levelId}`).then(setParallels).catch(() => {});
    setParallelId('');
  }, [levelId]);

  async function createStudent() {
    setCreateError(null);
    try {
      await api.post('/students', { firstName, lastName, identification, levelId, parallelId });
      setFirstName('');
      setLastName('');
      setIdentification('');
      setLevelId('');
      setParallelId('');
      load(search);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'No se pudo registrar el estudiante');
    }
  }

  async function toggleActive(s: Student) {
    await api.patch(`/students/${s.id}`, { isActive: !s.isActive });
    load(search);
  }

  async function deleteStudent(s: Student) {
    if (!window.confirm(`¿Eliminar a ${fullName(s)}? Esta acción no se puede deshacer.`)) return;
    setDeleteError(null);
    try {
      await api.delete(`/students/${s.id}`);
      load(search);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'No se pudo eliminar el estudiante');
    }
  }

  function openEdit(s: Student) {
    setEditTarget(s);
    setEditFirstName(s.firstName);
    setEditLastName(s.lastName);
    setEditLevelId(s.levelId);
    setEditParallelId(s.parallelId);
    setEditError(null);
    api.get<Parallel[]>(`/academic/parallels?levelId=${s.levelId}`).then(setEditParallels).catch(() => {});
  }

  function onEditLevelChange(newLevelId: string) {
    setEditLevelId(newLevelId);
    setEditParallelId('');
    if (newLevelId) {
      api.get<Parallel[]>(`/academic/parallels?levelId=${newLevelId}`).then(setEditParallels).catch(() => {});
    } else {
      setEditParallels([]);
    }
  }

  async function submitEdit() {
    if (!editTarget) return;
    setEditError(null);
    try {
      await api.patch(`/students/${editTarget.id}`, {
        firstName: editFirstName,
        lastName: editLastName,
        levelId: editLevelId,
        parallelId: editParallelId,
      });
      setEditTarget(null);
      load(search);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'No se pudo guardar los cambios');
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl">Estudiantes</h1>

      {isAdmin && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-end gap-3 p-5">
            <Input label="Nombres" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Input label="Apellidos" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            <Input
              label="Identificación"
              value={identification}
              onChange={(e) => setIdentification(e.target.value)}
            />
            <Select label="Nivel" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
              <option value="">Selecciona…</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
            <Select
              label="Paralelo"
              value={parallelId}
              onChange={(e) => setParallelId(e.target.value)}
              disabled={!levelId}
            >
              <option value="">Selecciona…</option>
              {parallels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Button
              disabled={!firstName || !lastName || !identification || !levelId || !parallelId}
              onClick={createStudent}
            >
              Registrar estudiante
            </Button>
          </div>
          {createError && <p className="px-5 pb-4 text-sm text-status-danger">{createError}</p>}
        </Card>
      )}

      <div className="mb-4">
        <Input placeholder="Buscar por nombre o identificación…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {deleteError && <p className="mb-4 text-sm text-status-danger">{deleteError}</p>}

      {error && <ErrorState title="No se pudo cargar la lista de estudiantes" />}
      {!error && !students && <Spinner />}
      {!error && students && students.length === 0 && (
        <EmptyState title="No se encontraron estudiantes con ese criterio." />
      )}
      {!error && students && students.length > 0 && (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-white font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-line">
                <th className="px-4 py-2 text-left">Estudiante</th>
                <th className="px-4 py-2 text-left">Identificación</th>
                <th className="px-4 py-2 text-left">Nivel</th>
                <th className="px-4 py-2 text-left">Paralelo</th>
                <th className="px-4 py-2 text-left">Estado</th>
                {isAdmin && <th className="px-4 py-2 text-left">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {students.map((s) => (
                <tr key={s.id} className="hover:bg-paper">
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/estudiantes/${s.id}`} className="text-accent-ink">
                      {fullName(s)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-ink-soft">{s.identification}</td>
                  <td className="px-4 py-2">{s.level?.name}</td>
                  <td className="px-4 py-2">{s.parallel?.name}</td>
                  <td className="px-4 py-2">
                    {isAdmin ? (
                      <button onClick={() => toggleActive(s)}>
                        <Badge tone={s.isActive ? 'accent' : 'neutral'}>
                          {s.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </button>
                    ) : (
                      <Badge tone={s.isActive ? 'accent' : 'neutral'}>
                        {s.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openEdit(s)}
                          title="Editar estudiante"
                          className="text-accent-ink hover:text-accent"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteStudent(s)}
                          title="Eliminar estudiante"
                          className="text-status-danger hover:opacity-70"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Editar estudiante">
        {editTarget && (
          <>
            <div className="flex flex-col gap-3">
              <Input label="Nombres" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
              <Input label="Apellidos" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
              <Select label="Nivel" value={editLevelId} onChange={(e) => onEditLevelChange(e.target.value)}>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <Select label="Paralelo" value={editParallelId} onChange={(e) => setEditParallelId(e.target.value)}>
                {editParallels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            {editError && <p className="mt-2 text-sm text-status-danger">{editError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditTarget(null)}>
                Cancelar
              </Button>
              <Button
                disabled={!editFirstName || !editLastName || !editLevelId || !editParallelId}
                onClick={submitEdit}
              >
                Guardar
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
