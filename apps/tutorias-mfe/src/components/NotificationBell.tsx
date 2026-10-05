'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi } from '@/lib/api';

interface Item {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

const REFRESH_MS = 60_000;

function timeAgo(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(new Date(iso));
}

/**
 * Campana de notificaciones del sistema (notification-service): faltas, tutorías finalizadas
 * con observaciones, tutorías no realizadas. Se actualiza cada minuto.
 */
export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    notificationsApi
      .get<{ items: Item[]; unread: number }>('/notifications?limit=15')
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  async function openItem(n: Item) {
    if (!n.isRead) await notificationsApi.post(`/notifications/${n.id}/read`).catch(() => {});
    if (n.link) window.location.href = n.link;
    else load();
  }

  async function readAll() {
    await notificationsApi.post('/notifications/read-all').catch(() => {});
    load();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-ink-soft hover:bg-paper hover:text-ink"
        aria-label={`Notificaciones${unread ? ` (${unread} sin leer)` : ''}`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger px-1 font-mono text-[10px] font-medium text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-md border border-line bg-white shadow-subtle">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-sm font-medium">Notificaciones</span>
            {unread > 0 && (
              <button onClick={readAll} className="text-xs text-accent-ink hover:underline">
                Marcar todas como leídas
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-soft">No tienes notificaciones.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button onClick={() => openItem(n)} className={`block w-full px-3 py-2.5 text-left hover:bg-paper ${n.isRead ? '' : 'bg-accent-tint/40'}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-sm ${n.isRead ? 'text-ink' : 'font-medium text-ink'} ${n.type === 'TUTORING_ABSENCES' || n.type === 'TUTORING_NOT_HELD' ? 'text-status-danger' : ''}`}>
                        {n.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-soft">{timeAgo(n.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-soft">{n.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
