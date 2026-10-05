import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type TxClient = Prisma.TransactionClient | PrismaService;

export interface AuditEntry {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
}

/**
 * Escribe en audit_logs (regla 15, sección 4). Recibe el cliente de la transacción activa
 * para que el registro de auditoría sea atómico con el cambio de negocio que lo origina —
 * si la transacción hace rollback, el log tampoco se escribe.
 */
@Injectable()
export class AuditLogService {
  record(tx: TxClient, entry: AuditEntry) {
    return tx.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        previousValue: entry.previousValue as Prisma.InputJsonValue,
        newValue: entry.newValue as Prisma.InputJsonValue,
      },
    });
  }
}
