'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ApiError, identityApi } from '@/lib/api';
import { safeNextPath } from '@/lib/session';
import { isDeceStaff } from '@/lib/modules';
import { ROLE_LABEL, type AuthPublicConfig, type Role } from '@/lib/types';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/EmptyState';

function LoginContent() {
  const { user, loading, loginWithGoogle, devLogin } = useAuth();
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const [config, setConfig] = useState<AuthPublicConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  // En el servidor (red local con CA propia) se ofrece volver a la página de bienvenida por http,
  // que guía la instalación del certificado. Se calcula en el cliente para no romper la hidratación.
  const [certHelpUrl, setCertHelpUrl] = useState<string | null>(null);
  useEffect(() => {
    const { protocol, hostname } = window.location;
    if (protocol === 'https:' && hostname !== 'localhost') setCertHelpUrl(`http://${hostname}/`);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [devEmail, setDevEmail] = useState('');
  const [devUsers, setDevUsers] = useState<{ email: string; fullName: string | null; role: Role }[] | null>(null);

  useEffect(() => {
    identityApi
      .get<AuthPublicConfig>('/auth/config')
      .then((cfg) => {
        setConfig(cfg);
        // Modo desarrollo: los usuarios se leen de la base de datos de identidad.
        if (cfg.devLoginEnabled) {
          identityApi
            .get<{ email: string; fullName: string | null; role: Role }[]>('/auth/dev-users')
            .then(setDevUsers)
            .catch(() => setDevUsers([]));
        }
      })
      .catch(() => setConfigError(true));
  }, []);

  function goNext() {
    // Docentes y animadores solo usan Tutorías: van directo al módulo, sin pasar por el portal.
    const target = next === '/' && !isDeceStaff(user?.role) ? '/tutorias' : next;
    // Rutas de otro micro frontend (ej. /tutorias/...) necesitan navegación dura.
    if (target.startsWith('/tutorias')) window.location.href = target;
    else router.replace(target);
  }

  useEffect(() => {
    if (!loading && user) goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  async function run(action: () => Promise<void>) {
    setError(null);
    setSubmitting(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.');
      setSubmitting(false);
    }
  }

  function handleDevSubmit(e: FormEvent) {
    e.preventDefault();
    run(() => devLogin(devEmail));
  }

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-accent px-16 py-12 text-white md:flex">
        <span className="font-heading text-sm font-semibold uppercase tracking-wide text-white/70">
          Unidad Educativa UETS
        </span>
        <div>
          <h1 className="mb-4 text-4xl text-white">Sistema DECE</h1>
          <p className="max-w-md text-base text-white/85">
            Departamento de Consejería Estudiantil: tutorías, solicitudes, citas, seguimiento de casos
            y reportes en un solo lugar.
          </p>
        </div>
        <p className="text-xs text-white/60">Acceso exclusivo para el personal de la institución.</p>
      </div>

      <div className="flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="mb-1 text-2xl">Iniciar sesión</h2>
          <p className="mb-8 text-sm text-ink-soft">
            Usa tu cuenta institucional{' '}
            <span className="font-medium text-ink">@{config?.allowedDomain ?? 'uets.edu.ec'}</span>.
          </p>

          {error && (
            <div role="alert" className="mb-5 rounded-md bg-status-danger-tint px-3 py-2 text-sm text-status-danger">
              {error}
            </div>
          )}

          {!config && !configError && <Spinner />}
          {configError && (
            <div className="rounded-md bg-status-danger-tint px-3 py-2 text-sm text-status-danger">
              No se pudo conectar con el servidor de autenticación.
            </div>
          )}

          {config && (
            <>
              {config.googleClientId ? (
                <div className={submitting ? 'pointer-events-none opacity-60' : ''}>
                  <GoogleSignInButton
                    clientId={config.googleClientId}
                    hostedDomain={config.allowedDomain}
                    onCredential={(credential) => run(() => loginWithGoogle(credential))}
                  />
                </div>
              ) : (
                <div className="rounded-md bg-status-warning-tint px-3 py-2 text-sm text-status-warning">
                  El inicio de sesión con Google aún no está configurado (falta GOOGLE_CLIENT_ID en el
                  identity-service).
                </div>
              )}

              <ul className="mt-8 space-y-1.5 text-xs text-ink-soft">
                <li>• Solo cuentas del personal @{config.allowedDomain}.</li>
                <li>• Las cuentas de estudiante (.est@{config.allowedDomain}) no tienen acceso.</li>
                <li>• Tu cuenta debe estar habilitada por el administrador del sistema.</li>
              </ul>

              {certHelpUrl && (
                <p className="mt-6 rounded-md bg-paper px-3 py-2 text-xs text-ink-soft">
                  ¿Tu navegador muestra &ldquo;No es seguro&rdquo; junto a la dirección?{' '}
                  <a href={certHelpUrl} className="font-medium text-accent-ink underline">
                    Configura este equipo
                  </a>{' '}
                  (una sola vez, 1 minuto).
                </p>
              )}

              {config.devLoginEnabled && (
                <form onSubmit={handleDevSubmit} className="mt-8 rounded-lg border border-dashed border-status-warning p-4">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-status-warning">
                    Acceso de desarrollo (sin Google)
                  </p>
                  {devUsers === null && <p className="mb-3 text-xs text-ink-soft">Cargando usuarios…</p>}
                  {devUsers && devUsers.length === 0 && (
                    <p className="mb-3 text-xs text-ink-soft">
                      No hay usuarios en la base de datos de identidad. Ejecuta <code>npm run db:setup</code>.
                    </p>
                  )}
                  {devUsers && devUsers.length > 0 && (
                    <ul className="mb-4 max-h-64 divide-y divide-line overflow-y-auto rounded-md border border-line bg-white">
                      {devUsers.map((u) => (
                        <li key={u.email}>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => run(() => devLogin(u.email))}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-paper disabled:opacity-60"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-ink">{u.fullName ?? u.email}</span>
                              {u.fullName && <span className="block truncate text-xs text-ink-soft">{u.email}</span>}
                            </span>
                            <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[11px] text-ink-soft">
                              {ROLE_LABEL[u.role]}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Input
                    label="Correo institucional"
                    type="email"
                    required
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    placeholder={`usuario@${config.allowedDomain}`}
                  />
                  <Button type="submit" variant="secondary" disabled={submitting} className="mt-3 w-full">
                    Entrar
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <LoginContent />
    </Suspense>
  );
}
