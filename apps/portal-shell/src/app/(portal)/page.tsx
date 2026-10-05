'use client';

import { useAuth } from '@/lib/auth';
import { modulesFor } from '@/lib/modules';
import { ROLE_LABEL } from '@/lib/types';
import { ModuleCard } from '@/components/ModuleCard';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

/** Inicio del Sistema DECE (equipo DECE): todos los procesos del departamento. */
export default function HomePage() {
  const { user } = useAuth();
  const modules = modulesFor(user?.role);
  const available = modules.filter((m) => m.status === 'available');
  const upcoming = modules.filter((m) => m.status === 'coming-soon');
  const firstName = user?.fullName?.split(' ')[0];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl">
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-sm text-ink-soft">
          Sistema del Departamento de Consejería Estudiantil{user ? ` · ${ROLE_LABEL[user.role]}` : ''}.
        </p>
      </div>

      <section className="mb-10">
        <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-ink-soft">En funcionamiento</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((m) => (
            <ModuleCard key={m.id} mod={m} />
          ))}
        </div>
      </section>

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-1 font-mono text-xs uppercase tracking-wide text-ink-soft">Próximos desarrollos</h2>
          <p className="mb-3 text-sm text-ink-soft">
            Procesos del DECE que se irán incorporando al sistema. Entra a cada uno para ver qué incluirá.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((m) => (
              <ModuleCard key={m.id} mod={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
