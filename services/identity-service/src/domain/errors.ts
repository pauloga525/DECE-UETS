/**
 * Errores de dominio. No conocen HTTP: la capa de presentación los traduce a códigos de
 * estado (ver presentation/http/domain-exception.filter.ts).
 */
export type DomainErrorCode =
  | 'INVALID_EMAIL'
  | 'EMAIL_DOMAIN_NOT_ALLOWED'
  | 'STUDENT_ACCOUNT_NOT_ALLOWED'
  | 'EMAIL_NOT_VERIFIED'
  | 'INVALID_GOOGLE_TOKEN'
  | 'GOOGLE_NOT_CONFIGURED'
  | 'USER_NOT_REGISTERED'
  | 'USER_INACTIVE'
  | 'GOOGLE_ACCOUNT_MISMATCH'
  | 'SESSION_INVALID'
  | 'USER_ALREADY_EXISTS'
  | 'USER_NOT_FOUND'
  | 'CANNOT_MODIFY_SELF'
  | 'LAST_ADMIN'
  | 'DEV_LOGIN_DISABLED';

const MESSAGES: Record<DomainErrorCode, string> = {
  INVALID_EMAIL: 'El correo no tiene un formato válido.',
  EMAIL_DOMAIN_NOT_ALLOWED: 'Solo se permiten cuentas institucionales @uets.edu.ec.',
  STUDENT_ACCOUNT_NOT_ALLOWED: 'Las cuentas de estudiante (.est@uets.edu.ec) no tienen acceso al sistema.',
  EMAIL_NOT_VERIFIED: 'La cuenta de Google no tiene el correo verificado.',
  INVALID_GOOGLE_TOKEN: 'No se pudo validar el inicio de sesión con Google. Intenta nuevamente.',
  GOOGLE_NOT_CONFIGURED: 'El inicio de sesión con Google no está configurado en el servidor.',
  USER_NOT_REGISTERED:
    'Tu cuenta institucional no está habilitada en el sistema DECE. Solicita acceso al administrador.',
  USER_INACTIVE: 'Tu cuenta está desactivada. Contacta al administrador.',
  GOOGLE_ACCOUNT_MISMATCH:
    'Esta cuenta de Google no coincide con la registrada para este correo. Contacta al administrador.',
  SESSION_INVALID: 'Sesión inválida o expirada.',
  USER_ALREADY_EXISTS: 'Ya existe un usuario con ese correo.',
  USER_NOT_FOUND: 'Usuario no encontrado.',
  CANNOT_MODIFY_SELF: 'No puedes quitarte tu propio rol de administrador ni desactivar tu propia cuenta.',
  LAST_ADMIN: 'Debe quedar al menos un administrador activo en el sistema.',
  DEV_LOGIN_DISABLED: 'No disponible.',
};

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message?: string,
  ) {
    super(message ?? MESSAGES[code]);
    this.name = 'DomainError';
  }
}
