import { clearSession, readSession } from './session';

// Relativo al origen del portal: next.config.js reenvía /api/** al API Gateway.
const IDENTITY_API_URL = process.env.NEXT_PUBLIC_IDENTITY_API_URL || '/api/identity';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}, baseUrl = IDENTITY_API_URL): Promise<T> {
  const token = readSession()?.token;
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor.', 0);
  }

  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      message = Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? message);
      code = body.code;
    } catch {
      // sin cuerpo JSON
    }
    // Sesión revocada o vencida: volver al login (salvo que ya estemos intentando entrar).
    if (res.status === 401 && token && typeof window !== 'undefined') {
      clearSession();
      window.location.href = '/login';
    }
    throw new ApiError(message, res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const identityApi = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
};

/** notification-service (campana de notificaciones), vía gateway. */
export const notificationsApi = {
  get: <T>(path: string) => request<T>(path, {}, '/api/notificaciones'),
  post: <T>(path: string) => request<T>(path, { method: 'POST' }, '/api/notificaciones'),
};
