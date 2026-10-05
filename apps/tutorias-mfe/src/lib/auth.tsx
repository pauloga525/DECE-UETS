'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, identityApi } from './api';
import { clearSession, readSession, redirectToPortalLogin, writeSessionUser, type SessionUser } from './session';
import type { UserRole } from './types';

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Este micro frontend no tiene login propio: consume la sesión que dejó el portal DECE
 * (login con Google). Sin sesión, redirige al login del portal.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      redirectToPortalLogin();
      return;
    }
    setUser(session.user);
    setLoading(false);

    // Revalida en segundo plano: si el admin cambió el rol o desactivó la cuenta, el
    // identity-service ya revocó el token (el 401 lo maneja api.ts → login del portal).
    identityApi
      .get<SessionUser>('/auth/session')
      .then((fresh) => {
        writeSessionUser(fresh);
        setUser(fresh);
      })
      .catch(() => {});

    // Cierre de sesión en otra pestaña o en otro módulo.
    function onStorage() {
      if (!readSession()) redirectToPortalLogin();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const logout = useCallback(async () => {
    try {
      // Revoca en el identity-service todos los tokens del usuario (en todos los módulos).
      await identityApi.post('/auth/logout');
    } catch {
      // el token puede ya estar vencido — no bloquea el logout local
    }
    clearSession();
    window.location.href = '/login';
  }, []);

  return <AuthContext.Provider value={{ user, loading, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

/** Protege una pantalla: exige sesión y, opcionalmente, restringe por rol. */
export function useRequireAuth(allowedRoles?: UserRole[]) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      router.replace('/'); // inicio del módulo (Next antepone el basePath /tutorias)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  return { user, loading };
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
