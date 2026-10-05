import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private audit: AuditLogService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Mismo mensaje para usuario inexistente y contraseña incorrecta: no revelar cuál falló.
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const payload = { sub: user.id, email: user.email, role: user.role, tv: user.tokenVersion };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  /**
   * Incrementa tokenVersion: invalida de inmediato todo JWT ya emitido para este usuario
   * (todas sus sesiones activas, no solo la que llamó a este endpoint — un JWT sin estado
   * no permite revocar uno solo sin llevar una lista negra por token).
   */
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await this.audit.record(this.prisma, {
      userId,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: userId,
    });
    return { success: true };
  }
}
