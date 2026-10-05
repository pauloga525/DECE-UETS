'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/types';
import { NotificationBell } from './NotificationBell';

function initials(name: string): string {
  const parts = name.split(/[\s._@-]/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

export function PortalHeader() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;
  const displayName = user.fullName || user.email;

  async function handleLogout() {
    setLoggingOut(true);
    await logout(); // redirige a /login
  }

  return (
    <header className="border-b border-line bg-white">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-heading text-sm font-semibold text-white">
            DE
          </span>
          <span className="leading-tight">
            <span className="block font-heading text-base font-semibold text-accent-ink">Sistema DECE</span>
            <span className="block text-xs text-ink-soft">Unidad Educativa UETS</span>
          </span>
        </Link>

        <div className="flex items-center gap-1">
        <NotificationBell />
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-paper"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            {user.pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.pictureUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-tint font-mono text-xs font-medium text-accent-ink">
                {initials(displayName)}
              </span>
            )}
            <span className="hidden text-left md:block">
              <span className="block text-sm text-ink">{displayName}</span>
              <span className="block text-xs text-ink-soft">{ROLE_LABEL[user.role]}</span>
            </span>
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 top-full z-10 mt-1 w-64 rounded-md border border-line bg-white py-1 shadow-subtle"
            >
              <div className="border-b border-line px-3 py-2">
                <div className="truncate text-sm font-medium text-ink">{displayName}</div>
                <div className="truncate text-xs text-ink-soft">{user.email}</div>
              </div>
              <Link href="/" className="block px-3 py-2 text-sm text-ink hover:bg-paper" onClick={() => setOpen(false)}>
                Inicio
              </Link>
              {user.role === 'ADMIN' && (
                <Link
                  href="/administracion/usuarios"
                  className="block px-3 py-2 text-sm text-ink hover:bg-paper"
                  onClick={() => setOpen(false)}
                >
                  Usuarios y roles
                </Link>
              )}
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="block w-full border-t border-line px-3 py-2 text-left text-sm text-status-danger hover:bg-status-danger-tint disabled:opacity-60"
              >
                {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
              </button>
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  );
}
