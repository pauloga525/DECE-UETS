'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { UserRole } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';

interface AppUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

const ROLES: UserRole[] = ['ADMIN', 'DECE', 'TEACHER', 'STUDENT'];

export default function UsersPage() {
  useRequireAuth(['ADMIN']);
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('DECE');
  const [error, setError] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  function load() {
    api.get<AppUser[]>('/users').then(setUsers);
  }

  useEffect(load, []);

  async function create() {
    setError(null);
    try {
      await api.post('/users', { email, password, role });
      setEmail('');
      setPassword('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el usuario');
    }
  }

  async function toggleActive(u: AppUser) {
    await api.patch(`/users/${u.id}`, { isActive: !u.isActive });
    load();
  }

  function openReset(u: AppUser) {
    setResetTarget(u);
    setNewPassword('');
    setResetError(null);
    setResetDone(false);
  }

  async function submitReset() {
    if (!resetTarget) return;
    setResetError(null);
    try {
      await api.patch(`/users/${resetTarget.id}/reset-password`, { newPassword });
      setResetDone(true);
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : 'No se pudo restablecer la contraseña');
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl">Usuarios</h1>

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3 p-5">
          <Input label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Select label="Rol" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
          <Button disabled={!email || password.length < 8} onClick={create}>
            Crear usuario
          </Button>
        </div>
        {error && <p className="px-5 pb-4 text-sm text-status-danger">{error}</p>}
      </Card>

      {!users && <Spinner />}
      {users && users.length === 0 && <EmptyState title="Aún no hay usuarios registrados." />}
      {users && users.length > 0 && (
        <Card>
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <div className="font-medium">{u.email}</div>
                  <div className="text-xs text-ink-soft">{u.role}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => openReset(u)} className="text-xs font-medium text-accent-ink hover:underline">
                    Restablecer contraseña
                  </button>
                  <button onClick={() => toggleActive(u)}>
                    <Badge tone={u.isActive ? 'accent' : 'neutral'}>{u.isActive ? 'Activo' : 'Inactivo'}</Badge>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title="Restablecer contraseña">
        {resetTarget && !resetDone && (
          <>
            <p className="mb-3 text-sm text-ink-soft">
              Nueva contraseña para <span className="font-medium text-ink">{resetTarget.email}</span>. No hay
              recuperación por correo — esto la reemplaza de inmediato, la anterior deja de funcionar.
            </p>
            <Input
              label="Nueva contraseña"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoFocus
            />
            {resetError && <p className="mt-2 text-sm text-status-danger">{resetError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setResetTarget(null)}>
                Cancelar
              </Button>
              <Button disabled={newPassword.length < 8} onClick={submitReset}>
                Restablecer
              </Button>
            </div>
          </>
        )}
        {resetTarget && resetDone && (
          <>
            <p className="mb-4 text-sm text-ink">
              Contraseña actualizada para <span className="font-medium">{resetTarget.email}</span>. Comunicásela por
              un canal seguro — no queda registrada en ningún otro lugar.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setResetTarget(null)}>Listo</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
