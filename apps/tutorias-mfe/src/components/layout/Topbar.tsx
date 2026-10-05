'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/types';
import { NotificationBell } from '@/components/NotificationBell';

function initials(email: string): string {
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return chars.toUpperCase();
}

export function Topbar() {
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

  async function handleLogout() {
    setLoggingOut(true);
    await logout(); // redirige al login del portal
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-1 border-b border-line bg-white px-6">
      <NotificationBell />
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-paper"
        >
          {user.pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.pictureUrl} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-tint font-mono text-xs font-medium text-accent-ink">
              {initials(user.email)}
            </span>
          )}
          <span className="hidden text-sm text-ink md:inline">{user.fullName ?? user.email}</span>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="text-ink-soft">
            <path
              d="M5 7.5L10 12.5L15 7.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-md border border-line bg-white py-1 shadow-subtle">
            <div className="border-b border-line px-3 py-2">
              <div className="truncate text-sm font-medium text-ink">{user.email}</div>
              <div className="text-xs text-ink-soft">{ROLE_LABEL[user.role]}</div>
            </div>
            {['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST'].includes(user.role) && (
              <a href="/" className="block px-3 py-2 text-sm text-ink hover:bg-paper">
                Ir al Sistema DECE
              </a>
            )}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="block w-full px-3 py-2 text-left text-sm text-status-danger hover:bg-status-danger-tint disabled:opacity-60"
            >
              {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
