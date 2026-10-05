import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

const BATCH = 20;
const MAX_BACKOFF_MS = 30 * 60_000;

/**
 * Entrega los eventos del outbox al notification-service, en orden y con reintentos con
 * espera creciente. Si el servicio está caído, los eventos esperan: ninguno se pierde.
 */
@Injectable()
export class OutboxPublisherWorker {
  private readonly log = new Logger(OutboxPublisherWorker.name);
  private readonly url: string | null;
  private readonly token: string;
  private running = false;

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    const base = config.get<string>('NOTIFICATION_SERVICE_URL');
    this.url = base ? `${base.replace(/\/$/, '')}/api/internal/events` : null;
    this.token = config.get<string>('INTERNAL_SERVICE_TOKEN', '');
    if (!this.url) this.log.warn('NOTIFICATION_SERVICE_URL no definido: los eventos quedan en cola sin enviarse.');
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async tick() {
    if (!this.url || this.running) return;
    this.running = true;
    try {
      await this.publishPending();
    } finally {
      this.running = false;
    }
  }

  async publishPending(now = new Date()) {
    const events = await this.prisma.domainEvent.findMany({
      where: { publishedAt: null, nextAttemptAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    for (const event of events) {
      try {
        const res = await fetch(this.url as string, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-token': this.token },
          body: JSON.stringify({
            id: event.id,
            type: event.type,
            aggregateId: event.aggregateId,
            occurredAt: event.createdAt,
            payload: event.payload,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        await this.prisma.domainEvent.update({ where: { id: event.id }, data: { publishedAt: new Date(), lastError: null } });
      } catch (e) {
        const attempts = event.attempts + 1;
        const wait = Math.min(MAX_BACKOFF_MS, 2 ** attempts * 10_000);
        await this.prisma.domainEvent.update({
          where: { id: event.id },
          data: { attempts, lastError: (e as Error).message, nextAttemptAt: new Date(Date.now() + wait) },
        });
        this.log.warn(`Evento ${event.type} (${event.id}) no entregado, intento ${attempts}: ${(e as Error).message}`);
        break; // conserva el orden: no adelanta eventos posteriores
      }
    }
  }
}
