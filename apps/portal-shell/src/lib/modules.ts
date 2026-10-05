import type { Role } from './types';

export type ModuleStatus = 'available' | 'coming-soon';
export type ModuleIcon = 'tutorias' | 'solicitudes' | 'citas' | 'expedientes' | 'casos' | 'reportes';
/** Maqueta que se dibuja en la pantalla de "próximo desarrollo" de cada módulo. */
export type ModulePreview = 'inbox' | 'calendar' | 'cases' | 'profile' | 'dashboard';

export interface DeceModule {
  id: string;
  name: string;
  /** Frase corta para el menú lateral y las tarjetas. */
  description: string;
  icon: ModuleIcon;
  status: ModuleStatus;
  /** Ruta del módulo. */
  href: string;
  /**
   * true = el módulo es un micro frontend aparte (otra app detrás del proxy del portal):
   * se navega con recarga completa (<a>), no con el router del portal.
   */
  zone: boolean;
  /** Roles que pueden entrar. */
  roles: Role[];
  /** Qué resolverá el módulo — pantalla de próximo desarrollo. */
  purpose?: string;
  plannedFeatures: { title: string; detail: string }[];
  preview?: ModulePreview;
}

/** Equipo DECE: ve el sistema completo (todos los módulos). */
export const DECE_ROLES: Role[] = ['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST'];
/** Docentes y animadores solo trabajan en Tutorías (pedido 2026-09-30). */
const TUTORING_ROLES: Role[] = [...DECE_ROLES, 'TEACHER', 'ANIMATOR'];

/**
 * Registro de módulos del Sistema DECE — lo único que el portal consulta para armar el
 * menú y el inicio. Cada módulo será un micro frontend + microservicio propio.
 *
 * Los módulos en desarrollo ya tienen su ruta reservada (/citas, /seguimiento…) con una
 * pantalla de próximo desarrollo servida por el portal. Para habilitar uno: crear su MFE con
 * ese basePath, agregar el rewrite en next.config.js dentro de `beforeFiles` (así gana sobre
 * la página del portal), su ruta en el gateway, y aquí status → 'available' y zone → true.
 * Ver docs/arquitectura.md.
 */
export const MODULES: DeceModule[] = [
  {
    id: 'tutorias',
    name: 'Tutorías académicas',
    description: 'Agenda, disponibilidad docente, asistencia, informes y reportes.',
    icon: 'tutorias',
    status: 'available',
    href: '/tutorias',
    zone: true,
    roles: TUTORING_ROLES,
    plannedFeatures: [],
  },
  {
    id: 'citas',
    name: 'Citas',
    description: 'Agenda de atención con estudiantes y representantes.',
    icon: 'citas',
    status: 'coming-soon',
    href: '/citas',
    zone: false,
    roles: DECE_ROLES,
    preview: 'calendar',
    purpose:
      'Organizar las atenciones individuales del equipo DECE con estudiantes, representantes y docentes, con recordatorios automáticos y registro de lo acordado.',
    plannedFeatures: [
      { title: 'Calendario del equipo', detail: 'Agenda de cada psicólogo y del coordinador, con disponibilidad compartida.' },
      { title: 'Citas con representantes', detail: 'Invitación por correo con Google Calendar, como en Tutorías.' },
      { title: 'Recordatorios', detail: 'Aviso automático el día anterior y una hora antes.' },
      { title: 'Registro de la atención', detail: 'Asistencia, motivo, acuerdos y compromisos de cada cita.' },
    ],
  },
  {
    id: 'seguimiento',
    name: 'Seguimiento de casos',
    description: 'Casos, intervenciones, derivaciones y cierre.',
    icon: 'casos',
    status: 'coming-soon',
    href: '/seguimiento',
    zone: false,
    roles: DECE_ROLES,
    preview: 'cases',
    purpose:
      'Acompañar cada caso de principio a fin: apertura, plan de intervención, bitácora de acciones, derivaciones externas y cierre, con alertas cuando un caso lleva tiempo sin movimiento.',
    plannedFeatures: [
      { title: 'Apertura por tipo de caso', detail: 'Académico, conductual, familiar, salud, vulneración de derechos…' },
      { title: 'Plan de intervención y bitácora', detail: 'Acciones con fecha, responsable y evidencias.' },
      { title: 'Derivaciones', detail: 'Registro y seguimiento de derivaciones a instituciones externas.' },
      { title: 'Alertas', detail: 'Casos sin seguimiento, plazos vencidos y casos prioritarios.' },
      { title: 'Confidencialidad', detail: 'Acceso por profesional asignado y auditoría de cada consulta.' },
    ],
  },
  {
    id: 'solicitudes',
    name: 'Solicitudes',
    description: 'Pedidos de atención dirigidos al DECE.',
    icon: 'solicitudes',
    status: 'coming-soon',
    href: '/solicitudes',
    zone: false,
    roles: DECE_ROLES,
    preview: 'inbox',
    purpose:
      'Recibir en un solo lugar los pedidos de atención de docentes, autoridades y representantes, priorizarlos y asignarlos a un profesional del DECE.',
    plannedFeatures: [
      { title: 'Bandeja de entrada', detail: 'Solicitudes con estado, prioridad y fecha límite.' },
      { title: 'Asignación', detail: 'El coordinador asigna cada solicitud a un psicólogo.' },
      { title: 'Conversión', detail: 'Una solicitud puede abrir una cita o un caso de seguimiento.' },
      { title: 'Aviso al solicitante', detail: 'Notificación automática cuando se atiende.' },
    ],
  },
  {
    id: 'expedientes',
    name: 'Expedientes estudiantiles',
    description: 'Ficha integral y confidencial de cada estudiante.',
    icon: 'expedientes',
    status: 'coming-soon',
    href: '/expedientes',
    zone: false,
    roles: DECE_ROLES,
    preview: 'profile',
    purpose:
      'Reunir en una ficha todo lo que el DECE sabe de un estudiante: datos familiares, historial de tutorías, citas, casos y documentos, con acceso restringido y auditado.',
    plannedFeatures: [
      { title: 'Datos personales y familiares', detail: 'Representantes, contactos y situación familiar.' },
      { title: 'Historial unificado', detail: 'Tutorías, citas, solicitudes y casos en una sola línea de tiempo.' },
      { title: 'Documentos', detail: 'Informes, certificados y actas adjuntos.' },
      { title: 'Acceso auditado', detail: 'Quién consultó qué y cuándo.' },
    ],
  },
  {
    id: 'reportes',
    name: 'Reportes DECE',
    description: 'Indicadores consolidados para autoridades y Distrito.',
    icon: 'reportes',
    status: 'coming-soon',
    href: '/reportes',
    zone: false,
    roles: DECE_ROLES,
    preview: 'dashboard',
    purpose:
      'Consolidar los indicadores de todos los módulos para las autoridades de la institución y los informes que solicita el Distrito / Ministerio.',
    plannedFeatures: [
      { title: 'Tablero por período', detail: 'Atenciones, casos abiertos y cerrados, asistencia a tutorías.' },
      { title: 'Informes oficiales', detail: 'Formatos requeridos por el Distrito / Ministerio.' },
      { title: 'Exportación', detail: 'PDF y Excel.' },
    ],
  },
];

export function canAccess(mod: DeceModule, role: Role | undefined) {
  return !!role && mod.roles.includes(role);
}

export function isDeceStaff(role: Role | undefined) {
  return !!role && DECE_ROLES.includes(role);
}

export function modulesFor(role: Role | undefined) {
  return MODULES.filter((m) => canAccess(m, role));
}

export function findModule(id: string) {
  return MODULES.find((m) => m.id === id);
}
