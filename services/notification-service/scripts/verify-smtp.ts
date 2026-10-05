/**
 * Verifica que las credenciales SMTP funcionen SIN enviar ningún correo
 * (abre la conexión, autentica y cierra). Uso: npm run mail:verify
 */
import { loadConfig } from '../src/infrastructure/config/app-config';
import { SmtpEmailSender } from '../src/infrastructure/mail/smtp-email.sender';

const cfg = loadConfig();
new SmtpEmailSender(cfg.mail)
  .verify()
  .then(() => {
    console.log(`SMTP OK: ${cfg.mail.user} autenticó en ${cfg.mail.host}:${cfg.mail.port} (no se envió nada).`);
    process.exit(0);
  })
  .catch((e: Error) => {
    console.error(`SMTP FALLÓ: ${e.message}`);
    process.exit(1);
  });
