'use client';

import { useState } from 'react';

export interface ReportValues {
  skills: string;
  observations: string;
  tasks: string;
}

const FIELD =
  'w-full rounded-md border border-line px-3 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent';

/** Informe de cierre: destrezas trabajadas, observaciones y tareas (pedido 7/9/2026). */
export function ReportForm({
  submitting,
  submitLabel,
  onSubmit,
}: {
  submitting: boolean;
  submitLabel: string;
  onSubmit: (values: ReportValues) => void;
}) {
  const [values, setValues] = useState<ReportValues>({ skills: '', observations: '', tasks: '' });
  const valid = values.skills.trim().length >= 3 && values.observations.trim().length >= 3;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(values);
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Destrezas trabajadas *</span>
        <textarea
          rows={3}
          required
          value={values.skills}
          onChange={(e) => setValues({ ...values, skills: e.target.value })}
          placeholder="Ej.: Resolución de ecuaciones de primer grado; interpretación de enunciados."
          className={FIELD}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Observaciones *</span>
        <textarea
          rows={3}
          required
          value={values.observations}
          onChange={(e) => setValues({ ...values, observations: e.target.value })}
          placeholder="Cómo trabajaron los estudiantes, dificultades, avances…"
          className={FIELD}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Tareas asignadas</span>
        <textarea
          rows={2}
          value={values.tasks}
          onChange={(e) => setValues({ ...values, tasks: e.target.value })}
          placeholder="Opcional — tareas que deben realizar los estudiantes."
          className={FIELD}
        />
      </label>
      <button
        type="submit"
        disabled={!valid || submitting}
        className="inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-ink disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
      >
        {submitting ? 'Guardando…' : submitLabel}
      </button>
    </form>
  );
}
