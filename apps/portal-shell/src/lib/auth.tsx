'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { identityApi } from './api';
import {
  clearSession,
  readSession,
  writeSession,
  writeSessionUser,
  type SessionUser,
} from './session';
import type { LoginResponse } from './types';

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  loginWithGoogle: (credential: string) => Promise<void>;
  devLogin: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toSessionUser(u: LoginResponse['user']): SessionUser {
  return { id: u.id, email: u.email, role: u.role, fullName: u.fullName, pictureUrl: u.pictureUrl };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = readSession();
    setUser(session?.user ?? null);
    setLoading(false);
    if (session) {
      // Revalida contra el identity-service (rol actualizado, cuenta desactivada...).
      identityApi
        .get<LoginResponse['user']>('/auth/session')
        .then((fresh) => {
          const u = toSessionUser(fresh);
          writeSessionUser(u);
          setUser(u);
        })
        .catch(() => {});
    }
    function onStorage() {
      setUser(readSession()?.user ?? null);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const complete = useCallback((res: LoginResponse) => {
    const u = toSessionUser(res.user);
    writeSession(res.accessToken, u);
    setUser(u);
  }, []);

  const loginWithGoogle = useCallback(
    async (credential: string) => complete(await identityApi.post<LoginResponse>('/auth/google', { credential })),
    [complete],
  );

  const devLogin = useCallback(
    async (email: string) => complete(await identityApi.post<LoginResponse>('/auth/dev-login', { email })),
    [complete],
  );

  const logout = useCallback(async () => {
    try {
      await identityApi.post('/auth/logout');
    } catch {
      // token ya inválido — igual se limpia la sesión local
    }
    clearSession();
    window.google?.accounts.id.disableAutoSelect();
    // Navegación dura en vez de setUser(null): así el layout protegido no alcanza a
    // redirigir a /login?next=<página actual>, que llevaría al siguiente usuario ahí.
    window.location.href = '/login';
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, devLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
