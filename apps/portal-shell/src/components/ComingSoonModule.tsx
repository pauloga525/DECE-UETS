'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { canAccess, findModule } from '@/lib/modules';
import { ModuleIcon } from './ModuleIcon';
import { ModulePreviewMock } from './ModulePreviews';
import { EmptyState } from './ui/EmptyState';

/**
 * Pantalla de un módulo del Sistema DECE que aún está en desarrollo: qué resolverá, qué
 * incluirá y una maqueta de cómo se verá. La ruta ya queda reservada para el módulo real.
 */
export function ComingSoonModule({ id }: { id: string }) {
  const { user } = useAuth();
  const mod = findModule(id);

  if (!mod || !canAccess(mod, user?.role)) {
    return <EmptyState title="Módulo no disponible." action={<Link href="/" className="text-sm text-accent-ink">Volver al inicio</Link>} />;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-accent-tint text-accent-ink">
          <ModuleIcon name={mod.icon} className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl">{mod.name}</h1>
            <span className="rounded-full bg-status-warning-tint px-2.5 py-0.5 text-xs font-medium text-status-warning">
              Próximo desarrollo
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-ink-soft">{mod.purpose ?? mod.description}</p>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-ink-soft">Qué incluirá</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mod.plannedFeatures.map((f) => (
            <div key={f.title} className="rounded-lg border border-line bg-white p-4 shadow-subtle">
              <div className="mb-1 text-sm font-semibold text-ink">{f.title}</div>
              <p className="text-sm text-ink-soft">{f.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {mod.preview && (
        <section className="mb-8">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-ink-soft">Vista previa</h2>
          <div className="relative overflow-hidden rounded-lg border border-line bg-white shadow-subtle">
            <div className="pointer-events-none select-none opacity-60 blur-[1px]" aria-hidden="true">
              <ModulePreviewMock kind={mod.preview} />
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-white/40">
              <span className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-ink shadow-subtle">
                Maqueta ilustrativa · módulo en construcción
              </span>
            </div>
          </div>
        </section>
      )}

      <div className="rounded-lg border border-dashed border-line bg-white px-5 py-4 text-sm text-ink-soft">
        Este módulo se incorporará al Sistema DECE como una aplicación independiente, con los mismos
        usuarios, roles e inicio de sesión con Google. Mientras tanto, los procesos relacionados se
        siguen gestionando como hasta ahora.
      </div>
    </div>
  );
}
