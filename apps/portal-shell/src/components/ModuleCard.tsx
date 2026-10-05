import Link from 'next/link';
import type { DeceModule } from '@/lib/modules';
import { ModuleIcon } from './ModuleIcon';

export function ModuleCard({ mod }: { mod: DeceModule }) {
  const available = mod.status === 'available';

  const body = (
    <>
      <div className="mb-4 flex items-start justify-between">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-lg ${
            available ? 'bg-accent text-white' : 'bg-paper text-ink-soft'
          }`}
        >
          <ModuleIcon name={mod.icon} className="h-6 w-6" />
        </span>
        {available ? (
          <span className="rounded-full bg-accent-tint px-2.5 py-0.5 text-xs font-medium text-accent-ink">
            Disponible
          </span>
        ) : (
          <span className="rounded-full bg-status-inactive-tint px-2.5 py-0.5 text-xs font-medium text-status-inactive">
            Próximamente
          </span>
        )}
      </div>
      <h3 className={`mb-1 text-base ${available ? '' : 'text-ink-soft'}`}>{mod.name}</h3>
      <p className="text-sm text-ink-soft">{mod.description}</p>
      <span
        className={`mt-4 inline-block text-sm font-medium ${
          available ? 'text-accent-ink group-hover:underline' : 'text-ink-soft'
        }`}
      >
        {available ? 'Abrir módulo →' : 'Ver qué incluirá →'}
      </span>
    </>
  );

  const className = `group flex h-full flex-col rounded-lg border bg-white p-5 shadow-subtle transition-colors ${
    available ? 'border-line hover:border-accent' : 'border-dashed border-line hover:bg-paper'
  }`;

  // Módulo disponible = otra zona (micro frontend): navegación dura con <a>, no <Link>,
  // porque la ruta la sirve otra aplicación Next.js detrás del proxy del portal.
  return mod.zone ? (
    <a href={mod.href} className={className}>
      {body}
    </a>
  ) : (
    <Link href={mod.href} className={className}>
      {body}
    </Link>
  );
}
