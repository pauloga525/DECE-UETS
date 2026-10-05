'use client';

import type { TutoringEnrollment } from '@/lib/types';
import { fullName } from '@/lib/format';

/**
 * Lista de asistencia con casillas (pedido 2026-10-02): marcado = asistió, sin marcar =
 * ausente. Se usa al iniciar y al finalizar la tutoría; el correo a cada representante dice
 * si su representado asistió o estuvo ausente.
 */
export function AttendanceChecklist({
  enrollments,
  present,
  onChange,
  disabled,
}: {
  enrollments: TutoringEnrollment[];
  present: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const all = enrollments.length > 0 && enrollments.every((e) => present.has(e.id));

  function toggle(id: string) {
    const next = new Set(present);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-ink-soft">
          <span className="font-mono font-medium text-accent-ink">{enrollments.filter((e) => present.has(e.id)).length}</span>{' '}
          asistieron · <span className="font-mono font-medium text-status-danger">{enrollments.filter((e) => !present.has(e.id)).length}</span>{' '}
          ausentes
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(all ? new Set() : new Set(enrollments.map((e) => e.id)))}
          className="font-medium text-accent-ink hover:underline disabled:opacity-50"
        >
          {all ? 'Desmarcar todos' : 'Marcar todos'}
        </button>
      </div>
      <ul className="divide-y divide-line rounded-md border border-line">
        {enrollments.map((e) => {
          const checked = present.has(e.id);
          return (
            <li key={e.id}>
              <label className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-paper ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(e.id)}
                  className="h-4 w-4 accent-[#1f6f5c]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.student ? fullName(e.student) : '—'}</span>
                  {e.student?.parallel && <span className="text-xs text-ink-soft">Paralelo {e.student.parallel.name}</span>}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    checked ? 'bg-accent-tint text-accent-ink' : 'bg-status-danger-tint text-status-danger'
                  }`}
                >
                  {checked ? 'Asistió' : 'Ausente'}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
