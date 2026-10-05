import type { ModulePreview } from '@/lib/modules';

/**
 * Maquetas ilustrativas (sin datos reales) de cómo se verá cada módulo. Se muestran
 * atenuadas en la pantalla de próximo desarrollo.
 */
const bar = 'rounded bg-line';

function Inbox() {
  const rows = [
    ['Alta', 'bg-status-danger-tint text-status-danger', 'Docente de 9.º A solicita atención por ausentismo'],
    ['Media', 'bg-status-warning-tint text-status-warning', 'Representante pide cita por bajo rendimiento'],
    ['Baja', 'bg-status-scheduled-tint text-status-scheduled', 'Rectorado solicita informe trimestral'],
    ['Media', 'bg-status-warning-tint text-status-warning', 'Inspección reporta conflicto entre estudiantes'],
  ];
  return (
    <div className="divide-y divide-line">
      {rows.map(([p, cls, text], i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{p}</span>
          <span className="flex-1 truncate text-sm text-ink">{text}</span>
          <span className={`${bar} h-2.5 w-16`} />
        </div>
      ))}
    </div>
  );
}

function Calendar() {
  const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
  const blocks: Record<number, [number, number, string][]> = {
    0: [[1, 2, 'Cita · Representante']],
    1: [[0, 1, 'Cita · Estudiante'], [3, 4, 'Reunión docente']],
    2: [[2, 3, 'Cita · Representante']],
    3: [[1, 3, 'Taller grupal']],
    4: [[0, 1, 'Cita · Estudiante']],
  };
  return (
    <div className="grid grid-cols-5 gap-px bg-line p-px">
      {days.map((d, i) => (
        <div key={d} className="bg-white">
          <div className="border-b border-line px-2 py-1.5 font-mono text-[11px] text-ink-soft">{d}</div>
          <div className="relative h-44">
            {(blocks[i] ?? []).map(([from, to, label], j) => (
              <div
                key={j}
                className="absolute inset-x-1 rounded border-l-2 border-status-scheduled bg-status-scheduled-tint px-1.5 py-1 text-[10px] text-status-scheduled"
                style={{ top: `${from * 25}%`, height: `${(to - from) * 25 - 2}%` }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Cases() {
  const columns: [string, string[]][] = [
    ['Abiertos', ['Académico · 8.º B', 'Familiar · 10.º A']],
    ['En intervención', ['Conductual · 9.º A', 'Salud · 1.º BGU', 'Académico · 2.º BGU']],
    ['Derivados', ['Vulneración · 9.º B']],
    ['Cerrados', ['Académico · 8.º A']],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
      {columns.map(([title, cards]) => (
        <div key={title} className="rounded-md bg-paper p-2">
          <div className="mb-2 font-mono text-[11px] uppercase text-ink-soft">{title}</div>
          <div className="flex flex-col gap-2">
            {cards.map((c) => (
              <div key={c} className="rounded border border-line bg-white p-2 text-xs text-ink">
                {c}
                <div className={`${bar} mt-2 h-1.5 w-2/3`} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Profile() {
  return (
    <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[14rem_1fr]">
      <div className="rounded-md border border-line p-4">
        <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-line" />
        <div className={`${bar} mx-auto mb-2 h-3 w-32`} />
        <div className={`${bar} mx-auto h-2.5 w-20`} />
        <div className="mt-4 flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`${bar} h-2.5`} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {['Tutoría · Matemáticas', 'Cita con representante', 'Caso abierto · Académico', 'Tutoría · Lengua'].map((t, i) => (
          <div key={t} className="flex items-center gap-3 rounded-md border border-line p-3">
            <span className={`h-2.5 w-2.5 rounded-full ${i % 2 ? 'bg-status-scheduled' : 'bg-accent'}`} />
            <span className="text-sm text-ink">{t}</span>
            <span className={`${bar} ml-auto h-2.5 w-20`} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Dashboard() {
  const heights = [40, 65, 50, 80, 70, 90, 60];
  return (
    <div className="p-4">
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {['Atenciones', 'Casos abiertos', 'Tutorías', 'Asistencia'].map((k) => (
          <div key={k} className="rounded-md border border-line p-3">
            <div className={`${bar} mb-2 h-5 w-12`} />
            <div className="text-xs text-ink-soft">{k}</div>
          </div>
        ))}
      </div>
      <div className="flex h-36 items-end gap-3 rounded-md border border-line p-3">
        {heights.map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-accent/60" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export function ModulePreviewMock({ kind }: { kind: ModulePreview }) {
  switch (kind) {
    case 'inbox':
      return <Inbox />;
    case 'calendar':
      return <Calendar />;
    case 'cases':
      return <Cases />;
    case 'profile':
      return <Profile />;
    case 'dashboard':
      return <Dashboard />;
  }
}
