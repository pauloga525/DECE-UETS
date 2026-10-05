import { Module } from '@nestjs/common';
import { HandleTutoringEvent } from './application/handle-tutoring-event';
import {
  DECE_DIRECTORY,
  DeceDirectory,
  EMAIL_SENDER,
  EmailSender,
  NOTIFICATION_STORE,
  NotificationStore,
} from './application/ports';
import { APP_CONFIG, AppConfig, loadConfig } from './infrastructure/config/app-config';
import { IdentityDeceDirectory, IdentitySessionClient } from './infrastructure/identity/identity-client';
import { SmtpEmailSender } from './infrastructure/mail/smtp-email.sender';
import { PrismaNotificationStore, PrismaService } from './infrastructure/persistence/prisma-notification.store';
import {
  InternalEventsController,
  NotificationsController,
  UserSessionGuard,
} from './presentation/http/controllers';

/** Raíz de composición: conecta el caso de uso con sus adaptadores (SMTP, identity, Prisma). */
@Module({
  controllers: [InternalEventsController, NotificationsController],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    PrismaService,
    { provide: EMAIL_SENDER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => new SmtpEmailSender(c.mail) },
    {
      provide: DECE_DIRECTORY,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => new IdentityDeceDirectory(c.identityServiceUrl, c.internalServiceToken),
    },
    { provide: NOTIFICATION_STORE, inject: [PrismaService], useFactory: (p: PrismaService) => new PrismaNotificationStore(p) },
    {
      provide: IdentitySessionClient,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => new IdentitySessionClient(c.identityServiceUrl),
    },
    UserSessionGuard,
    {
      provide: HandleTutoringEvent,
      inject: [EMAIL_SENDER, DECE_DIRECTORY, NOTIFICATION_STORE, APP_CONFIG],
      useFactory: (s: EmailSender, d: DeceDirectory, st: NotificationStore, c: AppConfig) =>
        new HandleTutoringEvent(s, d, st, {
          portalUrl: c.portalUrl,
          organizerEmail: 'noreply@uets.edu.ec',
          organizerName: 'Sistema DECE UETS',
        }),
    },
  ],
})
export class AppModule {}
