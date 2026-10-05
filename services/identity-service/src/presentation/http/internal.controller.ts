import { Controller, ForbiddenException, Get, Headers, Inject, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { ListUsers } from '../../application/use-cases/user-admin.use-cases';
import { Role, ROLES } from '../../domain/entities/user.entity';
import { APP_CONFIG, AppConfig } from '../../infrastructure/config/app-config';
import { Public } from './decorators';

/**
 * Endpoints servicio-a-servicio (no pasan por login de usuario; el gateway no los expone).
 * Autenticados con el secreto compartido INTERNAL_SERVICE_TOKEN.
 */
@ApiExcludeController()
@Public()
@Controller('internal')
export class InternalController {
  constructor(
    @Inject(APP_CONFIG) private config: AppConfig,
    private listUsers: ListUsers,
  ) {}

  /** Usuarios activos con alguno de los roles dados — ej. el equipo DECE a notificar. */
  @Get('users')
  async users(@Headers('x-internal-token') token: string | undefined, @Query('roles') roles?: string) {
    this.assertToken(token);
    const wanted = (roles ?? '').split(',').filter((r): r is Role => (ROLES as readonly string[]).includes(r));
    return (await this.listUsers.execute())
      .filter((u) => u.isActive && (wanted.length === 0 || wanted.includes(u.role)))
      .map(({ id, email, fullName, role }) => ({ id, email, fullName, role }));
  }

  private assertToken(token: string | undefined) {
    const expected = this.config.internalServiceToken;
    const ok =
      !!expected &&
      !!token &&
      token.length === expected.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    if (!ok) throw new ForbiddenException();
  }
}
