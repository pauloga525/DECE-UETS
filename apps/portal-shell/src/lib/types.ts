// Espeja los roles del identity-service (services/identity-service/prisma/schema.prisma).
export type Role = 'ADMIN' | 'PSYCHOLOGY_COORDINATOR' | 'PSYCHOLOGIST' | 'TEACHER' | 'ANIMATOR';

export const ROLES: Role[] = ['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST', 'TEACHER', 'ANIMATOR'];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador (root)',
  PSYCHOLOGY_COORDINATOR: 'Coordinador de psicólogos',
  PSYCHOLOGIST: 'Psicólogo(a)',
  TEACHER: 'Docente',
  ANIMATOR: 'Animador de curso',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  ADMIN: 'Acceso total a la plataforma. Único rol que asigna y modifica roles.',
  PSYCHOLOGY_COORDINATOR: 'Coordina al equipo de psicología del DECE y supervisa sus casos y agendas.',
  PSYCHOLOGIST: 'Profesional del DECE: tutorías, estudiantes, reportes y (a futuro) casos y citas.',
  TEACHER: 'Sube su horario, crea sus propias tutorías, toma lista y registra el informe de cierre.',
  ANIMATOR: 'Ve los alumnos de SU curso que tuvieron tutorías y genera reportes solo de ese curso. El curso se asigna en Tutorías → Niveles y paralelos.',
};

/** Roles del equipo de psicología (heredan los permisos del antiguo rol DECE). */
export const PSYCHOLOGY_ROLES: Role[] = ['PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST'];

export interface PlatformUser {
  id: string;
  email: string;
  fullName: string | null;
  pictureUrl: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: string;
  user: PlatformUser;
}

export interface AuthPublicConfig {
  googleClientId: string | null;
  allowedDomain: string;
  devLoginEnabled: boolean;
}
