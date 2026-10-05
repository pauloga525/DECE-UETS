import { Global, Module } from '@nestjs/common';
import { OutboxPublisherWorker } from './outbox-publisher.worker';

@Global()
@Module({ providers: [OutboxPublisherWorker] })
export class EventsModule {}
