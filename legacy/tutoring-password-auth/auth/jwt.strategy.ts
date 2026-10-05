import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  tv: number;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'change-me-in-production'),
    });
  }

  // El payload ya fue verificado (firma + expiración) por passport-jwt antes de llegar aquí.
  // Se compara igual contra la base porque el JWT en sí es sin estado: sin esto, cerrar
  // sesión, resetear una contraseña o desactivar un usuario no tendría ningún efecto hasta
  // que el token expirara solo (hasta 8h después).
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive || user.tokenVersion !== payload.tv) {
      throw new UnauthorizedException('Sesión inválida o expirada');
    }
    return { userId: user.id, email: user.email, role: user.role };
  }
}
