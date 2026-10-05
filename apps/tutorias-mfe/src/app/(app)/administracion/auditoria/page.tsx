'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { AuditLogEntry } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

const PAGE_SIZE = 20;

export default function AuditLogPage() {
  useRequireAuth(['ADMIN']);
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [error, setError] = useState(false);

  function load() {
    const params = new URLSearchParams({ skip: String(skip), take: String(PAGE_SIZE) });
    if (action) params.set('action', action);
    if (entityType) params.set('entityType', entityType);
    api
      .get<{ items: AuditLogEntry[]; total: number }>(`/audit-logs?${params.toString()}`)
      .then((res) => {
        setEntries(res.items);
        setTotal(res.total);
      })
      .catch(() => setError(true));
  }

  useEffect(load, [skip, action, entityType]);

  return (
    <div>
      <h1 className="mb-1 text-2xl">Auditoría</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Solo lectura — ningún registro es editable ni eliminable desde la interfaz (regla 15).
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Input
          label="Acción"
          placeholder="ej. CANCEL, SCHEDULE…"
          value={action}
          onChange={(e) => {
            setSkip(0);
            setAction(e.target.value);
          }}
        />
        <Input
          label="Entidad"
          placeholder="ej. TutoringSession"
          value={entityType}
          onChange={(e) => {
            setSkip(0);
            setEntityType(e.target.value);
          }}
        />
      </div>

      {error && <ErrorState title="No se pudo cargar la auditoría" onRetry={load} />}
      {!error && !entries && <Spinner />}
      {!error && entries && entries.length === 0 && (
        <EmptyState title="No hay eventos para los filtros seleccionados." />
      )}
      {!error && entries && entries.length > 0 && (
        <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2 text-left">Fecha</th>
                    <th className="px-4 py-2 text-left">Usuario</th>
                    <th className="px-4 py-2 text-left">Acción</th>
                    <th className="px-4 py-2 text-left">Entidad</th>
                    <th className="px-4 py-2 text-left">Valor anterior → nuevo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-2 font-mono text-xs text-ink-soft">
                        {new Date(e.createdAt).toLocaleString('es-EC')}
                      </td>
                      <td className="px-4 py-2">{e.user.email}</td>
                      <td className="px-4 py-2">
                        <Badge tone="accent">{e.action}</Badge>
                      </td>
                      <td className="px-4 py-2 text-ink-soft">
                        {e.entityType}
                        <div className="font-mono text-[10px]">{e.entityId.slice(0, 8)}…</div>
                      </td>
                      <td className="max-w-xs px-4 py-2 font-mono text-[11px] text-ink-soft">
                        {e.previousValue ? JSON.stringify(e.previousValue) : '—'} →{' '}
                        {e.newValue ? JSON.stringify(e.newValue) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="mt-3 flex items-center justify-between text-sm text-ink-soft">
            <span>
              {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} de {total}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
                Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={skip + PAGE_SIZE >= total}
                onClick={() => setSkip(skip + PAGE_SIZE)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
