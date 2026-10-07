'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { Teacher } from '@/lib/types';
import { fullName } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';
import { PencilIcon, TrashIcon } from '@/components/ui/icons';

import { Pagination, usePagination } from '@/components/ui/Pagination';
export default function TeachersPage() {
  const { user } = useRequireAuth(['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST']);
  const isAdmin = user?.role === 'ADMIN';

  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<Teacher | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  function load() {
    api.get<Teacher[]>('/teachers').then(setTeachers).catch(() => setError(true));
  }

  useEffect(load, []);

  const filtered = useMemo(
    () => (teachers ?? []).filter((t) => fullName(t).toLowerCase().includes(search.toLowerCase())),
    [teachers, search],
  );

  async function createTeacher() {
    setCreateError(null);
    try {
      await api.post('/teachers', { firstName, lastName, email, phone: phone || undefined });
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'No se pudo crear el docente');
    }
  }

  async function toggleActive(t: Teacher) {
    await api.patch(`/teachers/${t.id}`, { isActive: !t.isActive });
    load();
  }

  async function deleteTeacher(t: Teacher) {
    if (!window.confirm(`¿Eliminar a ${fullName(t)}? Esta acción no se puede deshacer.`)) return;
    setDeleteError(null);
    try {
      await api.delete(`/teachers/${t.id}`);
      load();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'No se pudo eliminar el docente');
    }
  }

  function openEdit(t: Teacher) {
    setEditTarget(t);
    setEditFirstName(t.firstName);
    setEditLastName(t.lastName);
    setEditPhone(t.phone ?? '');
    setEditError(null);
  }

  async function submitEdit() {
    if (!editTarget) return;
    setEditError(null);
    try {
      await api.patch(`/teachers/${editTarget.id}`, {
        firstName: editFirstName,
        lastName: editLastName,
        phone: editPhone || undefined,
      });
      setEditTarget(null);
      load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'No se pudo guardar los cambios');
    }
  }

  const pg = usePagination(filtered);
  return (
    <div>
      <h1 className="mb-6 text-2xl">Docentes</h1>

      {isAdmin && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-end gap-3 p-5">
            <Input label="Nombres" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Input label="Apellidos" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            <Input label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Teléfono (opcional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Button disabled={!firstName || !lastName || !email} onClick={createTeacher}>
              Crear docente
            </Button>
          </div>
          {createError && <p className="px-5 pb-4 text-sm text-status-danger">{createError}</p>}
        </Card>
      )}

      <div className="mb-4">
        <Input placeholder="Buscar docente…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {deleteError && <p className="mb-4 text-sm text-status-danger">{deleteError}</p>}

      {error && <ErrorState title="No se pudo cargar la lista de docentes" />}
      {!error && !teachers && <Spinner />}
      {!error && teachers && filtered.length === 0 && (
        <EmptyState title="No se encontraron docentes con ese criterio." />
      )}
      {!error && filtered.length > 0 && (
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-white font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-line">
                <th className="px-4 py-2 text-left">Docente</th>
                <th className="px-4 py-2 text-left">Correo</th>
                <th className="px-4 py-2 text-left">Teléfono</th>
                <th className="px-4 py-2 text-left">Estado</th>
                {isAdmin && <th className="px-4 py-2 text-left">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pg.pageItems.map((t) => (
                <tr key={t.id} className="hover:bg-paper">
                  <td className="px-4 py-2">
                    <Link href={`/docentes/${t.id}`} className="font-medium text-accent-ink">
                      {fullName(t)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-ink-soft">{t.email}</td>
                  <td className="px-4 py-2 text-ink-soft">{t.phone ?? '—'}</td>
                  <td className="px-4 py-2">
                    {isAdmin ? (
                      <button onClick={() => toggleActive(t)}>
                        <Badge tone={t.isActive ? 'accent' : 'neutral'}>
                          {t.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </button>
                    ) : (
                      <Badge tone={t.isActive ? 'accent' : 'neutral'}>
                        {t.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openEdit(t)}
                          title="Editar docente"
                          className="text-accent-ink hover:text-accent"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteTeacher(t)}
                          title="Eliminar docente"
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
      <Pagination {...pg} />

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Editar docente">
        {editTarget && (
          <>
            <div className="flex flex-col gap-3">
              <Input label="Nombres" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} />
              <Input label="Apellidos" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
              <Input label="Teléfono" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
            {editError && <p className="mt-2 text-sm text-status-danger">{editError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditTarget(null)}>
                Cancelar
              </Button>
              <Button disabled={!editFirstName || !editLastName} onClick={submitEdit}>
                Guardar
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
