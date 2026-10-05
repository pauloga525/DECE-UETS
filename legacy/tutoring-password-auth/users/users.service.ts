import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditLogService,
  ) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Ya existe un usuario con ese correo');

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, role: dto.role },
    });
    return this.sanitize(user);
  }

  async findAll() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.map((u) => this.sanitize(u));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return this.sanitize(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const user = await this.prisma.user.update({ where: { id }, data: dto });
    return this.sanitize(user);
  }

  /**
   * Restablecimiento de contraseña por un administrador (no hay recuperación por correo —
   * la Fase 4, que integraría notificaciones, no está construida). Nunca se puede "recuperar"
   * la contraseña anterior: los hashes son de un solo sentido, solo se puede fijar una nueva.
   */
  async resetPassword(id: string, dto: ResetPasswordDto, actorUserId: string) {
    await this.findOne(id);
    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    // tokenVersion++ para que, si el token viejo estaba comprometido (motivo típico de un
    // reset), quede inválido de inmediato en vez de seguir sirviendo hasta que expire solo.
    const user = await this.prisma.user.update({
      where: { id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    await this.audit.record(this.prisma, {
      userId: actorUserId,
      action: 'PASSWORD_RESET',
      entityType: 'User',
      entityId: id,
      newValue: { resetBy: actorUserId },
    });

    return this.sanitize(user);
  }

  private sanitize(user: { passwordHash: string; tokenVersion: number; [key: string]: unknown }) {
    const { passwordHash, tokenVersion, ...rest } = user;
    return rest;
  }
}
