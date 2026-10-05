import type { UserRole } from './types';

/**
 * Contrato de sesión compartido entre micro frontends (ver docs/arquitectura.md).
 *
 * El portal (apps/portal-shell) hace el login con Google y guarda la sesión en
 * localStorage bajo estas claves. Todos los micro frontends se sirven desde el mismo
 * origen (el portal hace de proxy de /tutorias/**), así que la leen directamente sin
 * acoplarse al código del portal. Cambiar estas claves exige cambiarlas en todos los MFE.
 */
export const SESSION_TOKEN_KEY = 'dece.accessToken';
export const SESSION_USER_KEY = 'dece.user';

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
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

export function writeSessionUser(user: SessionUser) {
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
}

/**
 * Navegación dura al login del portal (fuera del basePath /tutorias — por eso no se usa el
 * router de Next, que antepondría el basePath). Vuelve a la pantalla actual al terminar.
 */
export function redirectToPortalLogin() {
  const next = window.location.pathname + window.location.search;
  window.location.href = `/login?next=${encodeURIComponent(next)}`;
}
