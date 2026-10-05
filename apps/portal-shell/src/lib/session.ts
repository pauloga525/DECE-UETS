import type { Role } from './types';

/**
 * Contrato de sesión compartido entre micro frontends (ver docs/arquitectura.md).
 * El portal es el único que la escribe (login); los módulos solo la leen. Mismas claves en
 * apps/tutorias-mfe/src/lib/session.ts — cambiarlas exige actualizar todos los MFE.
 */
export const SESSION_TOKEN_KEY = 'dece.accessToken';
export const SESSION_USER_KEY = 'dece.user';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  fullName?: string | null;
  pictureUrl?: string | null;
}

export function readSession(): { token: string; user: SessionUser } | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    const user = localStorage.getItem(SESSION_USER_KEY);
    return token && user ? { token, user: JSON.parse(user) } : null;
  } catch {
    return null;
  }
}

export function writeSession(token: string, user: SessionUser) {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export function writeSessionUser(user: SessionUser) {
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
}

/**
 * Destino seguro tras el login: solo rutas relativas de este mismo origen. Evita que un
 * enlace malicioso "/login?next=https://otro-sitio" use el portal como redirector abierto.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}
