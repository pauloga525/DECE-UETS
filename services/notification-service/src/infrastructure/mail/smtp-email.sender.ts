import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
// Sin esModuleInterop: estos módulos exportan con `module.exports =`.
import MailComposer = require('nodemailer/lib/mail-composer');
import Mail = require('nodemailer/lib/mailer');
import { EmailDeliveryStatus, EmailSender } from '../../application/ports';
import { OutgoingEmail } from '../../domain/notification-plan';
import { AppConfig } from '../config/app-config';

/**
 * Envío por SMTP de Google Workspace con la cuenta noreply@uets.edu.ec.
 * Solo envía: el sistema nunca lee ni recibe correos, y no se pone Reply-To.
 */
export class SmtpEmailSender implements EmailSender {
  private readonly log = new Logger('Mail');
  private transporter: Transporter | null = null;

  constructor(private cfg: AppConfig['mail']) {}

  private transport() {
    this.transporter ??= nodemailer.createTransport({
      host: this.cfg.host,
      port: this.cfg.port,
      secure: this.cfg.port === 465,
      auth: { user: this.cfg.user, pass: this.cfg.pass },
      pool: true,
      maxConnections: 2,
      // Gmail limita el ritmo: ~ un correo cada 300 ms como máximo.
      rateDelta: 1000,
      rateLimit: 3,
    });
    return this.transporter;
  }

  /** Verifica credenciales SMTP sin enviar nada. */
  verify() {
    return this.transport().verify();
  }

  private message(email: OutgoingEmail): Mail.Options {
    const redirected = this.cfg.mode === 'redirect';
    return {
      from: this.cfg.from,
      to: redirected ? (this.cfg.redirectTo as string) : { name: email.toName, address: email.to },
      subject: redirected ? `[PRUEBA → ${email.to}] ${email.subject}` : email.subject,
      html: email.html,
      text: email.text,
      headers: {
        // Evita respuestas automáticas (fuera de oficina) hacia la cuenta noreply.
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
      },
      icalEvent: email.calendar
        ? { method: email.calendar.method, filename: 'invitacion.ics', content: email.calendar.content }
        : undefined,
    };
  }

  async send(email: OutgoingEmail): Promise<EmailDeliveryStatus> {
    const msg = this.message(email);
    if (this.cfg.mode === 'log') {
      const raw = await new MailComposer(msg).compile().build();
      mkdirSync(this.cfg.logDir, { recursive: true });
      const safe = email.to.replace(/[^a-z0-9@._-]/gi, '_');
      const file = join(this.cfg.logDir, `${new Date().toISOString().replace(/[:.]/g, '-')}_${safe}.eml`);
      writeFileSync(file, raw);
      this.log.log(`[simulado] ${email.audience} → ${email.to}: ${email.subject}`);
      return 'LOGGED';
    }
    await this.transport().sendMail(msg);
    return this.cfg.mode === 'redirect' ? 'REDIRECTED' : 'SENT';
  }
}
