import { InAppNotification, OutgoingEmail } from '../domain/notification-plan';
import { DeceMember } from '../domain/tutoring-event';

/** Puertos de la capa de aplicación — implementados en infrastructure/. */

export type EmailDeliveryStatus = 'SENT' | 'LOGGED' | 'REDIRECTED';

export interface EmailSender {
  send(email: OutgoingEmail): Promise<EmailDeliveryStatus>;
}

export interface DeceDirectory {
  /** Equipo DECE que recibe avisos: coordinador(es) y psicólogos activos. */
  members(): Promise<DeceMember[]>;
}

export interface NotificationStore {
  /** Marca el evento como procesado; false si ya lo estaba (reintento del outbox). */
  claimEvent(eventId: string, type: string): Promise<boolean>;
  releaseEvent(eventId: string): Promise<void>;
  saveInApp(items: InAppNotification[]): Promise<void>;
  logEmail(entry: {
    eventId: string;
    eventType: string;
    audience: string;
    to: string;
    subject: string;
    status: EmailDeliveryStatus | 'FAILED';
    error?: string;
  }): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
export const DECE_DIRECTORY = Symbol('DECE_DIRECTORY');
export const NOTIFICATION_STORE = Symbol('NOTIFICATION_STORE');
