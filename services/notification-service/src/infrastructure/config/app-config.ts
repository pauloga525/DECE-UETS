export type MailMode = 'send' | 'log' | 'redirect';

export interface AppConfig {
  port: number;
  isProduction: boolean;
  identityServiceUrl: string;
  internalServiceToken: string | null;
  portalUrl: string;
  mail: {
    /**
     * send: envía de verdad. log: no envía, guarda cada correo como .eml en MAIL_LOG_DIR
     * (por defecto en desarrollo). redirect: envía, pero TODO va a MAIL_REDIRECT_TO.
     */
    mode: MailMode;
    /** MAIL_MODE pedido en el .env que se ignoró por no estar en producción. */
    forcedFrom: MailMode | null;
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
    redirectTo: string | null;
    logDir: string;
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

let envFileLoaded = false;
function loadEnvFileOnce() {
  if (envFileLoaded) return;
  envFileLoaded = true;
  try {
    process.loadEnvFile('.env');
  } catch {
    // sin .env: variables del entorno (Docker)
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env === process.env) loadEnvFileOnce();
  const isProduction = env.NODE_ENV === 'production';
  const requested = (env.MAIL_MODE as MailMode) || (isProduction ? 'send' : 'log');
  if (!['send', 'log', 'redirect'].includes(requested)) throw new Error(`MAIL_MODE inválido: ${requested}`);
  // En desarrollo NUNCA se envían correos (pedido 2026-10-02): la base de desarrollo tiene
  // correos reales de padres de familia. Fuera de producción se fuerza "log" aunque el .env
  // diga otra cosa. Para una prueba de envío controlada existe `npm run mail:test`.
  const mode: MailMode = isProduction ? requested : 'log';
  const forcedFrom = !isProduction && requested !== 'log' ? requested : null;
  if (mode === 'redirect' && !env.MAIL_REDIRECT_TO) throw new Error('MAIL_MODE=redirect exige MAIL_REDIRECT_TO');

  return {
    port: Number(env.PORT ?? 4003),
    isProduction,
    identityServiceUrl: (env.IDENTITY_SERVICE_URL ?? 'http://localhost:4001').replace(/\/$/, ''),
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN?.trim() || null,
    portalUrl: env.PORTAL_URL ?? 'http://localhost:3100',
    mail: {
      mode,
      forcedFrom,
      host: env.SMTP_HOST ?? 'smtp.gmail.com',
      port: Number(env.SMTP_PORT ?? 465),
      user: env.SMTP_USER ?? '',
      pass: env.SMTP_PASS ?? '',
      // Solo noreply@uets.edu.ec, sin Reply-To (pedido 2026-09-30: nadie responde a estos correos).
      from: env.MAIL_FROM ?? 'Sistema DECE UETS <noreply@uets.edu.ec>',
      redirectTo: env.MAIL_REDIRECT_TO?.trim() || null,
      logDir: env.MAIL_LOG_DIR ?? 'mail-outbox',
    },
  };
}
