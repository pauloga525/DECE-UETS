import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogFiltersDto } from './dto/audit-log-filters.dto';

/**
 * Lectura de audit_logs (pantalla 25). Separado de AuditLogService (que solo escribe,
 * inyectado en cada módulo de negocio) para que el límite de solo-lectura de esta pantalla
 * quede explícito en el código, no solo en la UI.
 */
@Injectable()
export class AuditLogQueryService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: AuditLogFiltersDto) {
    const where = {
      userId: filters.userId,
      action: filters.action,
      entityType: filters.entityType,
      createdAt: {
        gte: filters.from ? new Date(filters.from) : undefined,
        lte: filters.to ? new Date(filters.to) : undefined,
      },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: filters.skip ?? 0,
        take: filters.take ?? 50,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}
