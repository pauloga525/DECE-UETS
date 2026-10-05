import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserRole } from '@prisma/client';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from './authenticated-user';

interface SessionView {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

/**
 * Adaptador hacia el identity-service. Este microservicio ya no autentica a nadie por sí
 * mismo (no hay contraseñas ni login aquí):
 *
 *  1. Verifica localmente la firma RS256 del JWT con la clave pública del identity-service
 *     (JWKS). Rechaza tokens falsos o vencidos sin hacer ninguna llamada de red extra.
 *  2. Introspección: pregunta a identity (GET /auth/session) si la sesión sigue vigente —
 *     es lo que hace efectivos el logout, la desactivación y el cambio de rol antes de que
 *     el token expire solo. Se cachea unos segundos para no llamar en cada request.
 *  3. Mantiene la proyección local `users` (id/email/rol) que usan las FK de auditoría,
 *     inscripciones, etc. — cada microservicio guarda su propia copia de lo que necesita.
 */
@Injectable()
export class IdentityClient {
  private readonly log = new Logger(IdentityClient.name);
  private readonly baseUrl: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<string, { user: AuthenticatedUser; expiresAt: number }>();

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.baseUrl = config.get<string>('IDENTITY_SERVICE_URL', 'http://localhost:4001').replace(/\/$/, '');
    this.jwks = createRemoteJWKSet(new URL(`${this.baseUrl}/api/.well-known/jwks.json`));
    this.issuer = config.get<string>('JWT_ISSUER', 'uets-dece-identity');
    this.audience = config.get<string>('JWT_AUDIENCE', 'uets-dece');
    this.cacheTtlMs = Number(config.get('IDENTITY_SESSION_CACHE_TTL_MS', 30_000));
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    const cached = this.cache.get(token);
    if (cached && cached.expiresAt > Date.now()) return cached.user;

    try {
      await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['RS256'],
      });
    } catch {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }

    const session = await this.introspect(token);
    const user: AuthenticatedUser = { userId: session.id, email: session.email, role: session.role };
    await this.syncLocalUser(session);

    this.remember(token, user);
    return user;
  }

  private async introspect(token: string): Promise<SessionView> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5_000),
      });
    } catch (e) {
      this.log.error(`identity-service no responde: ${(e as Error).message}`);
      throw new UnauthorizedException('No se pudo validar la sesión (servicio de identidad no disponible)');
    }
    if (!res.ok) throw new UnauthorizedException('Sesión inválida o expirada');
    return (await res.json()) as SessionView;
  }

  private async syncLocalUser(session: SessionView) {
    try {
      await this.prisma.user.upsert({
        where: { id: session.id },
        create: { id: session.id, email: session.email, role: session.role, isActive: session.isActive },
        update: { email: session.email, role: session.role, isActive: session.isActive },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Mismo correo con otro id: usuario legado que no pasó por import-tutoring-users.
        this.log.error(`Correo ${session.email} ya existe en tutorías con otro id — ejecutar la importación de usuarios`);
        throw new UnauthorizedException('Cuenta inconsistente entre servicios. Contacta al administrador.');
      }
      throw e;
    }

    // Vincula automáticamente la ficha de docente con su cuenta la primera vez que entra.
    if (session.role === 'TEACHER') {
      await this.prisma.teacher.updateMany({
        where: { email: session.email, userId: null },
        data: { userId: session.id },
      });
    }
  }

  private remember(token: string, user: AuthenticatedUser) {
    const now = Date.now();
    if (this.cache.size > 1_000) {
      for (const [key, entry] of this.cache) if (entry.expiresAt <= now) this.cache.delete(key);
    }
    this.cache.set(token, { user, expiresAt: now + this.cacheTtlMs });
  }
}
