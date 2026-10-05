import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Inject,
  Injectable,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { HandleTutoringEvent } from '../../application/handle-tutoring-event';
import { TutoringEvent } from '../../domain/tutoring-event';
import { APP_CONFIG, AppConfig } from '../../infrastructure/config/app-config';
import { IdentitySessionClient, SessionUser } from '../../infrastructure/identity/identity-client';
import { PrismaService } from '../../infrastructure/persistence/prisma-notification.store';

// ── Autenticación de usuarios (campana) ─────────────────────────────────────────────────
@Injectable()
export class UserSessionGuard implements CanActivate {
  constructor(private sessions: IdentitySessionClient) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('Sesión inválida o expirada');
    const user = await this.sessions.resolve(token);
    if (!user) throw new UnauthorizedException('Sesión inválida o expirada');
    req.user = user;
    return true;
  }
}

const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): SessionUser => ctx.switchToHttp().getRequest().user);

/** Notificaciones dentro del sistema (campana del portal) — cada usuario ve solo las suyas. */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(UserSessionGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Mis notificaciones más recientes y el total sin leer' })
  async mine(@CurrentUser() user: SessionUser, @Query('limit') limit?: string) {
    const take = Math.min(Number(limit) || 20, 100);
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    ]);
    return { items, unread };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: user.id }, data: { isRead: true } });
    return { success: true };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() user: SessionUser) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
    return { success: true };
  }
}

// ── Entrada de eventos de otros microservicios ──────────────────────────────────────────
/**
 * Solo servicio-a-servicio (secreto compartido); el gateway bloquea /internal/** hacia afuera.
 */
@Controller('internal')
export class InternalEventsController {
  constructor(
    @Inject(APP_CONFIG) private config: AppConfig,
    private handle: HandleTutoringEvent,
  ) {}

  @Post('events')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  receive(@Headers('x-internal-token') token: string | undefined, @Body() event: TutoringEvent) {
    const expected = this.config.internalServiceToken;
    const ok = !!expected && !!token && token.length === expected.length && timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    if (!ok) throw new ForbiddenException();
    if (!event?.id || !event?.type?.startsWith('tutoring.') || !event.payload?.session) {
      throw new ForbiddenException('Evento no reconocido');
    }
    return this.handle.execute(event);
  }

  @Get('health')
  @ApiExcludeEndpoint()
  health() {
    return { status: 'ok', service: 'notification-service', mailMode: this.config.mail.mode };
  }
}
