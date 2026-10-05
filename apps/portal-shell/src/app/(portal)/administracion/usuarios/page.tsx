'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, identityApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE_DESCRIPTION, ROLE_LABEL, ROLES, type PlatformUser, type Role } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';

function formatDate(iso: string | null) {
  if (!iso) return 'Nunca';
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

interface PendingChange {
  user: PlatformUser;
  changes: { role?: Role; isActive?: boolean };
}

/**
 * Asignación y modificación de roles de toda la plataforma DECE (identity-service).
 * Solo el administrador (root). No hay contraseñas: cada persona entra con Google.
 */
export default function UsersPage() {
  const { user: me } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [roleFilter, setRoleFilter] = useState<Role | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('TEACHER');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [pending, setPending] = useState<PendingChange | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);

  useEffect(() => {
    if (me && me.role !== 'ADMIN') router.replace('/');
  }, [me, router]);

  const load = useCallback(() => {
    setLoadError(false);
    identityApi
      .get<PlatformUser[]>('/users')
      .then(setUsers)
      .catch(() => setLoadError(true));
  }, []);

  useEffect(load, [load]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
    users?.forEach((u) => u.isActive && c[u.role]++);
    return c;
  }, [users]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users ?? []).filter(
      (u) =>
        (roleFilter === 'ALL' || u.role === roleFilter) &&
        (!q || u.email.includes(q) || u.fullName?.toLowerCase().includes(q)),
    );
  }, [users, roleFilter, search]);

  async function create() {
    setError(null);
    setSaving(true);
    try {
      await identityApi.post('/users', { email, role, fullName: fullName || undefined });
      setEmail('');
      setFullName('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo habilitar la cuenta');
    } finally {
      setSaving(false);
    }
  }

  async function confirmPending() {
    if (!pending) return;
    setPendingError(null);
    try {
      await identityApi.patch(`/users/${pending.user.id}`, pending.changes);
      setPending(null);
      load();
    } catch (err) {
      setPendingError(err instanceof ApiError ? err.message : 'No se pudo actualizar el usuario');
    }
  }

  const emailLooksValid = /^[^@\s]+@uets\.edu\.ec$/i.test(email) && !/\.est@/i.test(email);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl">Usuarios y roles</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Solo las cuentas registradas aquí pueden entrar al sistema DECE con Google. El rol aplica a
        todos los módulos. Cambiar el rol o desactivar una cuenta cierra sus sesiones abiertas.
      </p>

      {/* Catálogo de roles — también sirve de filtro */}
      <section className="mb-6">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-ink-soft">Roles</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {ROLES.map((r) => {
            const active = roleFilter === r;
            return (
              <button
                key={r}
                onClick={() => setRoleFilter(active ? 'ALL' : r)}
                aria-pressed={active}
                className={`rounded-lg border bg-white p-4 text-left shadow-subtle transition-colors ${
                  active ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-accent'
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-heading text-sm font-semibold">{ROLE_LABEL[r]}</span>
                  <span className="font-mono text-lg text-accent-ink">{users ? counts[r] : '–'}</span>
                </div>
                <p className="text-xs text-ink-soft">{ROLE_DESCRIPTION[r]}</p>
              </button>
            );
          })}
        </div>
      </section>

      <Card className="mb-6">
        <div className="border-b border-line px-5 py-3 text-sm font-semibold">Registrar cuenta</div>
        <div className="grid grid-cols-1 items-end gap-3 p-5 md:grid-cols-[2fr_2fr_1.5fr_auto]">
          <Input
            label="Correo institucional"
            type="email"
            placeholder="nombre.apellido@uets.edu.ec"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input label="Nombre (opcional)" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Select label="Rol" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
          <Button disabled={!emailLooksValid || saving} onClick={create}>
            Registrar
          </Button>
        </div>
        {email && !emailLooksValid && (
          <p className="px-5 pb-4 text-xs text-ink-soft">
            Debe ser una cuenta del personal @uets.edu.ec (las cuentas .est@ no tienen acceso).
          </p>
        )}
        {error && <p className="px-5 pb-4 text-sm text-status-danger">{error}</p>}
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-xs uppercase tracking-wide text-ink-soft">
          {roleFilter === 'ALL' ? 'Todos los usuarios' : ROLE_LABEL[roleFilter]}
          {users && ` · ${visible.length}`}
        </h2>
        <input
          type="search"
          placeholder="Buscar por nombre o correo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-md border border-line px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      {loadError && <ErrorState title="No se pudieron cargar los usuarios." onRetry={load} />}
      {!loadError && !users && <Spinner />}
      {users && visible.length === 0 && <EmptyState title="No hay usuarios con este filtro." />}
      {users && visible.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="px-5 py-3 font-medium">Usuario</th>
                  <th className="px-5 py-3 font-medium">Rol</th>
                  <th className="px-5 py-3 font-medium">Último acceso</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((u) => {
                  const isMe = u.id === me?.id;
                  return (
                    <tr key={u.id} className={u.isActive ? '' : 'opacity-60'}>
                      <td className="px-5 py-3">
                        <div className="font-medium">
                          {u.fullName ?? '—'}
                          {isMe && <span className="ml-2 text-xs font-normal text-ink-soft">(tú)</span>}
                        </div>
                        <div className="text-xs text-ink-soft">{u.email}</div>
                      </td>
                      <td className="px-5 py-3">
                        <select
                          aria-label={`Rol de ${u.email}`}
                          value={u.role}
                          disabled={isMe}
                          title={isMe ? 'No puedes cambiar tu propio rol' : undefined}
                          onChange={(e) => {
                            setPendingError(null);
                            setPending({ user: u, changes: { role: e.target.value as Role } });
                          }}
                          className="rounded-md border border-line bg-white px-2 py-1 text-sm disabled:text-ink-soft"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-3 text-ink-soft">{formatDate(u.lastLoginAt)}</td>
                      <td className="px-5 py-3">
                        <button
                          disabled={isMe}
                          onClick={() => {
                            setPendingError(null);
                            setPending({ user: u, changes: { isActive: !u.isActive } });
                          }}
                          title={isMe ? 'No puedes desactivar tu propia cuenta' : 'Cambiar estado'}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium disabled:cursor-not-allowed ${
                            u.isActive
                              ? 'bg-accent-tint text-accent-ink'
                              : 'bg-status-inactive-tint text-status-inactive'
                          }`}
                        >
                          {u.isActive ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={!!pending} onClose={() => setPending(null)} title="Confirmar cambio">
        {pending && (
          <>
            <p className="mb-4 text-sm text-ink">
              {pending.changes.role ? (
                <>
                  Cambiar el rol de <span className="font-medium">{pending.user.email}</span> de{' '}
                  <span className="font-medium">{ROLE_LABEL[pending.user.role]}</span> a{' '}
                  <span className="font-medium">{ROLE_LABEL[pending.changes.role]}</span>.
                </>
              ) : (
                <>
                  {pending.changes.isActive ? 'Reactivar' : 'Desactivar'} la cuenta de{' '}
                  <span className="font-medium">{pending.user.email}</span>.
                </>
              )}
            </p>
            <p className="mb-4 text-xs text-ink-soft">
              Sus sesiones abiertas se cerrarán; deberá volver a iniciar sesión con Google.
            </p>
            {pendingError && <p className="mb-3 text-sm text-status-danger">{pendingError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)}>
                Cancelar
              </Button>
              <Button onClick={confirmPending}>Confirmar</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
