import { DomainError } from '../errors';

export interface EmailPolicy {
  /** Dominio exacto permitido, ej. "uets.edu.ec". Subdominios y dominios parecidos se rechazan. */
  allowedDomain: string;
  /** Sufijos de la parte local que identifican cuentas no permitidas, ej. [".est"]. */
  blockedLocalSuffixes: string[];
}

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+$/;

/**
 * Correo institucional válido para acceder al sistema DECE.
 *
 * Regla de negocio: solo cuentas @uets.edu.ec del personal. Las cuentas de estudiantes
 * (nombre.apellido.est@uets.edu.ec) comparten el dominio pero no tienen acceso.
 */
export class InstitutionalEmail {
  private constructor(readonly value: string) {}

  static create(raw: string, policy: EmailPolicy): InstitutionalEmail {
    const email = (raw ?? '').trim().toLowerCase();
    if (!EMAIL_SHAPE.test(email)) throw new DomainError('INVALID_EMAIL');

    const [localPart, domain] = email.split('@');
    // Comparación exacta: "alumnos.uets.edu.ec" o "uets.edu.ec.otro.com" no pasan.
    if (domain !== policy.allowedDomain.toLowerCase()) {
      throw new DomainError('EMAIL_DOMAIN_NOT_ALLOWED');
    }
    const blocked = policy.blockedLocalSuffixes.some((suffix) =>
      localPart.endsWith(suffix.toLowerCase()),
    );
    if (blocked) throw new DomainError('STUDENT_ACCOUNT_NOT_ALLOWED');

    return new InstitutionalEmail(email);
  }
}
