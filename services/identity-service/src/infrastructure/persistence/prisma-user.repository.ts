import { Prisma, User as UserRow } from '@prisma/client';
import { User } from '../../domain/entities/user.entity';
import { AuthEventLog, NewUserData, UserRepository } from '../../domain/ports';
import { PrismaService } from './prisma.service';

function toDomain(row: UserRow): User {
  return User.rehydrate({
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    pictureUrl: row.pictureUrl,
    googleSub: row.googleSub,
    role: row.role,
    isActive: row.isActive,
    tokenVersion: row.tokenVersion,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  });
}

export class PrismaUserRepository implements UserRepository {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string) {
    const row = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    return row ? toDomain(row) : null;
  }

  async findAll() {
    const rows = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toDomain);
  }

  countActiveAdmins() {
    return this.prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
  }

  async create(data: NewUserData) {
    const row = await this.prisma.user.create({
      data: { email: data.email.toLowerCase(), role: data.role, fullName: data.fullName ?? null },
    });
    return toDomain(row);
  }

  async save(user: User) {
    const { id, createdAt, ...rest } = user.toSnapshot();
    await this.prisma.user.update({ where: { id }, data: rest });
  }
}

export class PrismaAuthEventLog implements AuthEventLog {
  constructor(private prisma: PrismaService) {}

  async record(event: Parameters<AuthEventLog['record']>[0]) {
    await this.prisma.authEvent.create({
      data: {
        type: event.type,
        userId: event.userId ?? null,
        email: event.email ?? null,
        detail: (event.detail ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
