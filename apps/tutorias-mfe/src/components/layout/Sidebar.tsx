'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useAnimatorCourses } from '@/lib/animator';
import { ROLE_LABEL, type UserRole } from '@/lib/types';

interface NavItem {
  label: string;
  href: string;
  roles?: UserRole[];
  /** Solo para quien anima al menos un curso (docente o animador). */
  animatorOnly?: boolean;
}
interface NavGroup {
  label?: string;
  items: NavItem[];
}

// Estructura de navegación — sección 9.2 del plan. Las rutas son relativas al basePath del
// micro frontend (/tutorias): Next.js lo antepone solo en <Link>.
const STAFF: UserRole[] = ['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST', 'TEACHER'];
const DECE: UserRole[] = ['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST'];

const NAV: NavGroup[] = [
  { items: [{ label: 'Inicio', href: '/', roles: STAFF }] },
  {
    // El animador solo ve su curso (pedido 2026-09-30). Un docente también puede ser
    // animador: ve este grupo además de sus tutorías, solo para consulta (pedido 2026-10-05).
    label: 'Mi curso (animador)',
    items: [
      { label: 'Alumnos del curso', href: '/animador', animatorOnly: true },
      { label: 'Reporte del curso', href: '/animador/reporte', animatorOnly: true },
    ],
  },
  {
    label: 'Tutorías',
    items: [
      { label: 'Agenda', href: '/agenda', roles: STAFF },
      // El docente crea tutorías solo para sí mismo (validado en el backend) — pedido 7/9/2026.
      { label: 'Crear tutoría', href: '/crear', roles: STAFF },
      { label: 'Mi horario', href: '/mi-horario', roles: ['TEACHER'] },
      { label: 'Mis alumnos', href: '/mis-alumnos', roles: ['TEACHER'] },
      { label: 'Programadas', href: '/agenda?status=SCHEDULED', roles: STAFF },
      { label: 'En curso', href: '/agenda?status=IN_PROGRESS', roles: STAFF },
      { label: 'Historial', href: '/agenda?status=COMPLETED', roles: STAFF },
    ],
  },
  {
    label: 'Docentes',
    // Solo Admin y equipo de psicología: gestión de docentes, no es algo que otro docente deba ver.
    items: [
      { label: 'Lista de docentes', href: '/docentes', roles: DECE },
      { label: 'Disponibilidad', href: '/docentes/disponibilidad', roles: DECE },
      { label: 'Asignaciones académicas', href: '/docentes/asignaciones', roles: DECE },
    ],
  },
  {
    label: 'Estudiantes',
    items: [{ label: 'Lista de estudiantes', href: '/estudiantes', roles: STAFF }],
  },
  {
    label: 'Configuración académica',
    items: [
      { label: 'Períodos académicos', href: '/configuracion/periodos', roles: ['ADMIN'] },
      { label: 'Niveles, paralelos y animadores', href: '/configuracion/niveles', roles: ['ADMIN'] },
      { label: 'Materias', href: '/configuracion/materias', roles: ['ADMIN'] },
    ],
  },
  { items: [{ label: 'Reportes', href: '/reportes', roles: DECE }] },
  {
    // Los usuarios y roles se administran en el portal DECE (identity-service).
    label: 'Administración',
    items: [{ label: 'Auditoría del módulo', href: '/administracion/auditoria', roles: ['ADMIN'] }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentHref = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
  const { user } = useAuth();
  const { courses } = useAnimatorCourses();
  const isAnimator = (courses?.length ?? 0) > 0;

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-line bg-white">
      <div className="border-b border-line px-5 py-4">
        {/* Solo el equipo DECE tiene el sistema completo; docentes y animadores solo Tutorías.
            <a> y no <Link>: el portal es otra aplicación (otra zona), fuera del basePath. */}
        {user && ['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST'].includes(user.role) ? (
          <a href="/" className="mb-1 block text-xs text-ink-soft hover:text-ink">
            ← Sistema DECE
          </a>
        ) : (
          <span className="mb-1 block text-xs text-ink-soft">Sistema DECE · UETS</span>
        )}
        <span className="font-heading text-base font-semibold text-accent-ink">Tutorías académicas</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((group, i) => {
          const items = group.items.filter((item) =>
            item.animatorOnly ? isAnimator : !item.roles || (user && item.roles.includes(user.role)),
          );
          if (items.length === 0) return null;
          return (
            <div key={i} className="mb-5">
              {group.label && (
                <div className="mb-1.5 px-2 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                  {group.label}
                </div>
              )}
              {items.map((item, itemIndex) => {
                // Varios items de un mismo grupo pueden apuntar al mismo href (ej. "Lista de
                // docentes"/"Disponibilidad"/"Asignaciones académicas" son atajos a la misma
                // página). Sin este dedupe, los tres se marcan activos a la vez apenas uno
                // coincide con la ruta actual.
                const isFirstWithHref = items.findIndex((i) => i.href === item.href) === itemIndex;
                const active =
                  isFirstWithHref &&
                  (item.href.includes('?')
                    ? currentHref === item.href
                    : pathname === item.href && !searchParams.get('status'));
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`block rounded-md px-2 py-1.5 text-sm ${
                      active ? 'bg-accent-tint font-medium text-accent-ink' : 'text-ink hover:bg-paper'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      {user && (
        <div className="border-t border-line px-4 py-3">
          <div className="truncate text-sm font-medium text-ink">{user.fullName ?? user.email}</div>
          <div className="text-xs text-ink-soft">
            {ROLE_LABEL[user.role]}
            {isAnimator && user.role !== 'ANIMATOR' ? ' · Animador' : ''}
          </div>
        </div>
      )}
    </aside>
  );
}
