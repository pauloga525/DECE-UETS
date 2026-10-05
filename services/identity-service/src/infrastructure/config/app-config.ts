import { EmailPolicy } from '../../domain/value-objects/institutional-email';

export interface AppConfig {
  port: number;
  isProduction: boolean;
  googleClientId: string | null;
  emailPolicy: EmailPolicy;
  devLoginEnabled: boolean;
  /** Secreto compartido para llamadas servicio-a-servicio (/internal/**). */
  internalServiceToken: string | null;
  jwt: {
    issuer: string;
    audience: string;
    expiresIn: string;
    /** PEM PKCS#8. Si falta y no es producción, se genera y persiste en .keys/ */
    privateKeyPem: string | null;
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

let envFileLoaded = false;

/**
 * Carga services/identity-service/.env en process.env (sin pisar variables ya definidas,
 * p. ej. las de Docker). Antes el archivo solo se cargaba de rebote al importar Prisma.
 */
function loadEnvFileOnce() {
  if (envFileLoaded) return;
  envFileLoaded = true;
  try {
    process.loadEnvFile('.env');
  } catch {
    // sin .env (producción/Docker): se usan las variables del entorno
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env === process.env) loadEnvFileOnce();
  const isProduction = env.NODE_ENV === 'production';
  const devLoginRequested = env.DEV_LOGIN_ENABLED === 'true';

  return {
    port: Number(env.PORT ?? 4001),
    isProduction,
    googleClientId: env.GOOGLE_CLIENT_ID?.trim() || null,
    emailPolicy: {
      allowedDomain: env.ALLOWED_EMAIL_DOMAIN?.trim() || 'uets.edu.ec',
      blockedLocalSuffixes: (env.BLOCKED_EMAIL_LOCAL_SUFFIXES ?? '.est')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
    // Nunca en producción, aunque la variable esté puesta por error.
    devLoginEnabled: devLoginRequested && !isProduction,
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN?.trim() || null,
    jwt: {
      issuer: env.JWT_ISSUER ?? 'uets-dece-identity',
      audience: env.JWT_AUDIENCE ?? 'uets-dece',
      expiresIn: env.JWT_EXPIRES_IN ?? '8h',
      // Las variables de entorno no admiten saltos de línea cómodamente: se acepta "\n" literal.
      privateKeyPem: env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n').trim() || null,
    },
  };
}
