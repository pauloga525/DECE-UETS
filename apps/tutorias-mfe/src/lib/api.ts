import { clearSession, readSession, redirectToPortalLogin } from './session';

// Rutas relativas al origen del portal: /api/** lo reenvía al API Gateway, que enruta
// /api/tutorias/** al tutoring-service y /api/identity/** al identity-service.
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/tutorias';
export const IDENTITY_API_URL = process.env.NEXT_PUBLIC_IDENTITY_API_URL || '/api/identity';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function getToken(): string | null {
  return readSession()?.token ?? null;
}

async function request<T>(path: string, options: RequestInit = {}, baseUrl = API_URL): Promise<T> {
  const token = getToken();
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? message);
    } catch {
      // respuesta sin cuerpo JSON — se conserva el statusText
    }

    // Token vencido, inválido, o el usuario fue desactivado: la sesión ya no sirve.
    // Sin esto, cualquier pantalla que dispare un fetch con un token muerto revienta
    // con un error sin manejar en vez de mandar al usuario de vuelta al login del portal.
    if (res.status === 401 && typeof window !== 'undefined' && token) {
      clearSession();
      redirectToPortalLogin();
    }

    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Llamadas al identity-service (sesión, logout) — compartido con el portal vía gateway. */
export const identityApi = {
  get: <T>(path: string) => request<T>(path, {}, IDENTITY_API_URL),
  post: <T>(path: string) => request<T>(path, { method: 'POST' }, IDENTITY_API_URL),
};

/** Descarga un endpoint autenticado (ej. exportación CSV) como archivo del navegador. */
export async function downloadFile(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.statusText, res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** notification-service (campana), vía gateway. */
export const notificationsApi = {
  get: <T>(path: string) => request<T>(path, {}, '/api/notificaciones'),
  post: <T>(path: string) => request<T>(path, { method: 'POST' }, '/api/notificaciones'),
};
