import { loadConfig } from './app-config';

const base = { SMTP_USER: 'noreply@uets.edu.ec', SMTP_PASS: 'x' };

describe('loadConfig — envío de correos', () => {
  it('en desarrollo simula por defecto', () => {
    expect(loadConfig({ ...base }).mail.mode).toBe('log');
  });

  it.each(['send', 'redirect'])('en desarrollo ignora MAIL_MODE=%s y no envía', (mode) => {
    const cfg = loadConfig({ ...base, MAIL_MODE: mode, MAIL_REDIRECT_TO: 'x@uets.edu.ec' });
    expect(cfg.mail.mode).toBe('log');
    expect(cfg.mail.forcedFrom).toBe(mode);
  });

  it('en producción envía de verdad', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).mail.mode).toBe('send');
  });

  it('en producción respeta MAIL_MODE (p. ej. redirect para pruebas)', () => {
    const cfg = loadConfig({ ...base, NODE_ENV: 'production', MAIL_MODE: 'redirect', MAIL_REDIRECT_TO: 'x@uets.edu.ec' });
    expect(cfg.mail.mode).toBe('redirect');
  });
});
