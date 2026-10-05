import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { NotificationStore } from '../../application/ports';
import { InAppNotification } from '../../domain/notification-plan';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

export class PrismaNotificationStore implements NotificationStore {
  constructor(private prisma: PrismaService) {}

  async claimEvent(eventId: string, type: string) {
    try {
      await this.prisma.processedEvent.create({ data: { id: eventId, type } });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
      throw e;
    }
  }

  async releaseEvent(eventId: string) {
    await this.prisma.processedEvent.deleteMany({ where: { id: eventId } });
  }

  async saveInApp(items: InAppNotification[]) {
    if (items.length) await this.prisma.notification.createMany({ data: items });
  }

  async logEmail(entry: Parameters<NotificationStore['logEmail']>[0]) {
    await this.prisma.emailLog.create({ data: entry });
  }
}
