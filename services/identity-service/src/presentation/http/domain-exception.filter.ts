import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { DomainError, DomainErrorCode } from '../../domain/errors';

const STATUS: Record<DomainErrorCode, HttpStatus> = {
  INVALID_EMAIL: HttpStatus.BAD_REQUEST,
  EMAIL_DOMAIN_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  STUDENT_ACCOUNT_NOT_ALLOWED: HttpStatus.FORBIDDEN,
  EMAIL_NOT_VERIFIED: HttpStatus.FORBIDDEN,
  USER_NOT_REGISTERED: HttpStatus.FORBIDDEN,
  USER_INACTIVE: HttpStatus.FORBIDDEN,
  GOOGLE_ACCOUNT_MISMATCH: HttpStatus.FORBIDDEN,
  CANNOT_MODIFY_SELF: HttpStatus.FORBIDDEN,
  LAST_ADMIN: HttpStatus.CONFLICT,
  INVALID_GOOGLE_TOKEN: HttpStatus.UNAUTHORIZED,
  SESSION_INVALID: HttpStatus.UNAUTHORIZED,
  GOOGLE_NOT_CONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
  USER_ALREADY_EXISTS: HttpStatus.CONFLICT,
  USER_NOT_FOUND: HttpStatus.NOT_FOUND,
  DEV_LOGIN_DISABLED: HttpStatus.NOT_FOUND,
};

/** Traduce errores de dominio a respuestas HTTP con un "code" estable para el frontend. */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const status = STATUS[error.code] ?? HttpStatus.BAD_REQUEST;
    host.switchToHttp().getResponse<Response>().status(status).json({
      statusCode: status,
      code: error.code,
      message: error.message,
    });
  }
}
