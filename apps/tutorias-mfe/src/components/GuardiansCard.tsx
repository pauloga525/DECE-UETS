'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { StudentGuardianLink } from '@/lib/types';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

const EMPTY = { firstName: '', lastName: '', identification: '', email: '', phone: '', relationship: '' };

/**
 * Representantes del estudiante (pedido 2026-09-30). Reciben los correos de las tutorías
 * (invitación de calendario, inicio, cierre, faltas). Solo Admin y equipo de psicología.
 */
export function GuardiansCard({ studentId }: { studentId: string }) {
  const [links, setLinks] = useState<StudentGuardianLink[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<StudentGuardianLink[]>(`/students/${studentId}/guardians`).then(setLinks).catch(() => setLinks([]));
  }, [studentId]);

  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      load();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar');
      return false;
    }
  }

  async function add() {
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ''));
    if (await run(() => api.post(`/students/${studentId}/guardians`, body))) {
      setForm(EMPTY);
      setAdding(false);
    }
  }

  const field = (key: keyof typeof EMPTY, label: string, type = 'text') => (
    <Input label={label} type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
  );

  return (
    <Card className="mb-8">
      <CardHeader className="flex items-center justify-between">
        <span className="text-sm font-medium">Representantes</span>
        {!adding && (
          <Button variant="ghost" onClick={() => setAdding(true)}>
            + Agregar
          </Button>
        )}
      </CardHeader>
      <CardBody>
        {error && <p className="mb-3 text-sm text-status-danger">{error}</p>}
        {links && links.length === 0 && !adding && (
          <p className="text-sm text-status-warning">
            Sin representante registrado: no recibirá los correos de las tutorías.
          </p>
        )}
        {links && links.length > 0 && (
          <ul className="divide-y divide-line">
            {links.map((l) => (
              <li key={l.guardianId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="font-medium">
                    {l.guardian.firstName} {l.guardian.lastName}
                    {l.relationship && <span className="ml-2 font-normal text-ink-soft">· {l.relationship}</span>}
                  </div>
                  <div className="text-xs text-ink-soft">
                    {l.guardian.email ?? 'Sin correo'}
                    {l.guardian.phone ? ` · ${l.guardian.phone}` : ''}
                    {l.guardian.email?.endsWith('.test') && ' · dato de prueba'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    title="Recibe o no los correos de tutorías"
                    onClick={() => run(() => api.patch(`/students/${studentId}/guardians/${l.guardianId}`, { notifications: !l.notifications }))}
                  >
                    <Badge tone={l.notifications && l.guardian.email ? 'accent' : 'neutral'}>
                      {l.notifications ? 'Recibe correos' : 'Sin correos'}
                    </Badge>
                  </button>
                  <button
                    onClick={() => run(() => api.delete(`/students/${studentId}/guardians/${l.guardianId}`))}
                    className="text-xs text-status-danger hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {adding && (
          <div className="mt-3 rounded-md border border-line p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {field('firstName', 'Nombres *')}
              {field('lastName', 'Apellidos *')}
              {field('identification', 'Cédula')}
              {field('relationship', 'Parentesco (ej. Madre)')}
              {field('email', 'Correo', 'email')}
              {field('phone', 'Teléfono')}
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              Si ya existe un representante con esa cédula (hermanos), se vincula el mismo.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={() => setAdding(false)}>
                Cancelar
              </Button>
              <Button disabled={form.firstName.trim().length < 2 || form.lastName.trim().length < 2} onClick={add}>
                Guardar representante
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
