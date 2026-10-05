import { planNotifications, PlanContext } from '../domain/notification-plan';
import { TutoringEvent } from '../domain/tutoring-event';
import { DeceDirectory, EmailSender, NotificationStore } from './ports';

/**
 * Procesa un evento de tutorías: decide destinatarios (dominio), envía los correos y guarda
 * las notificaciones del sistema. Idempotente: un reintento del mismo evento no duplica nada.
 */
export class HandleTutoringEvent {
  constructor(
    private sender: EmailSender,
    private directory: DeceDirectory,
    private store: NotificationStore,
    private ctx: Omit<PlanContext, 'sequence'>,
  ) {}

  async execute(event: TutoringEvent) {
    if (!(await this.store.claimEvent(event.id, event.type))) {
      return { duplicated: true, emails: 0, inApp: 0, failed: 0 };
    }
    try {
      const dece = await this.directory.members();
      const plan = planNotifications(event, dece, {
        ...this.ctx,
        sequence: Math.floor(new Date(event.occurredAt).getTime() / 1000),
      });

      await this.store.saveInApp(plan.inApp);

      let failed = 0;
      for (const email of plan.emails) {
        try {
          const status = await this.sender.send(email);
          await this.store.logEmail({ eventId: event.id, eventType: event.type, audience: email.audience, to: email.to, subject: email.subject, status });
        } catch (e) {
          // Un destinatario con problemas (buzón inexistente, etc.) no bloquea a los demás.
          failed++;
          await this.store.logEmail({
            eventId: event.id,
            eventType: event.type,
            audience: email.audience,
            to: email.to,
            subject: email.subject,
            status: 'FAILED',
            error: (e as Error).message.slice(0, 500),
          });
        }
      }
      return { duplicated: false, emails: plan.emails.length, inApp: plan.inApp.length, failed };
    } catch (e) {
      // Falla antes de enviar (p. ej. identity caído): liberar para que el outbox reintente.
      await this.store.releaseEvent(event.id);
      throw e;
    }
  }
}
