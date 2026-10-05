'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { modulesFor, type DeceModule } from '@/lib/modules';
import { ModuleIcon } from './ModuleIcon';

function HomeIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2Z" />
    </svg>
  );
}

function UsersIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

const ITEM = 'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors';

function ModuleLink({ mod, active }: { mod: DeceModule; active: boolean }) {
  const className = `${ITEM} ${active ? 'bg-accent-tint font-medium text-accent-ink' : 'text-ink hover:bg-paper'}`;
  const body = (
    <>
      <ModuleIcon name={mod.icon} className={`h-5 w-5 shrink-0 ${mod.status === 'available' ? 'text-accent' : 'text-ink-soft'}`} />
      <span className="flex-1 truncate">{mod.name}</span>
      {mod.status === 'coming-soon' && (
        <span className="rounded-full bg-status-inactive-tint px-1.5 py-0.5 text-[10px] font-medium text-status-inactive">Pronto</span>
      )}
    </>
  );
  // Un módulo disponible es otra aplicación (micro frontend): navegación completa.
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

/**
 * Menú del Sistema DECE (solo equipo DECE): todos los procesos del departamento en un lugar.
 * Tutorías es funcional; el resto muestra su pantalla de próximo desarrollo.
 */
export function PortalSidebar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const modules = modulesFor(user?.role);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const nav = (
    <>
      <Link href="/" className={`${ITEM} ${pathname === '/' ? 'bg-accent-tint font-medium text-accent-ink' : 'text-ink hover:bg-paper'}`}>
        <HomeIcon className="h-5 w-5 shrink-0 text-ink-soft" />
        Inicio
      </Link>
      <div className="mb-1 mt-5 px-3 font-mono text-[11px] uppercase tracking-wide text-ink-soft">Módulos</div>
      {modules.map((m) => (
        <ModuleLink key={m.id} mod={m} active={isActive(m.href)} />
      ))}
      {user?.role === 'ADMIN' && (
        <>
          <div className="mb-1 mt-5 px-3 font-mono text-[11px] uppercase tracking-wide text-ink-soft">Administración</div>
          <Link
            href="/administracion/usuarios"
            className={`${ITEM} ${isActive('/administracion') ? 'bg-accent-tint font-medium text-accent-ink' : 'text-ink hover:bg-paper'}`}
          >
            <UsersIcon className="h-5 w-5 shrink-0 text-ink-soft" />
            Usuarios y roles
          </Link>
        </>
      )}
    </>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-line bg-white md:block">
        <nav className="sticky top-0 flex flex-col gap-0.5 p-3" aria-label="Módulos del Sistema DECE">
          {nav}
        </nav>
      </aside>
      {/* Pantallas pequeñas: el mismo menú en una franja desplazable. */}
      <nav className="flex gap-1 overflow-x-auto border-b border-line bg-white px-2 py-2 md:hidden [&>*]:shrink-0 [&>div]:hidden" aria-label="Módulos del Sistema DECE">
        {nav}
      </nav>
    </>
  );
}
