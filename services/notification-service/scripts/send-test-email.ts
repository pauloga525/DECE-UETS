/**
 * Envía correos REALES de prueba, pero todos redirigidos a UNA sola dirección (nunca a los
 * destinatarios del ejemplo). Genera una tutoría ficticia y manda la invitación del docente y
 * la del representante, con su invitación de Google Calendar.
 *
 * Uso: npm run mail:test -- tu.correo@uets.edu.ec
 */
import { loadConfig } from '../src/infrastructure/config/app-config';
import { SmtpEmailSender } from '../src/infrastructure/mail/smtp-email.sender';
import { planNotifications } from '../src/domain/notification-plan';
import { TutoringEvent } from '../src/domain/tutoring-event';

async function main() {
  const to = process.argv[2]?.trim().toLowerCase();
  if (!to || !to.endsWith('@uets.edu.ec')) throw new Error('Uso: npm run mail:test -- tu.correo@uets.edu.ec');

  const cfg = loadConfig();
  const sender = new SmtpEmailSender({ ...cfg.mail, mode: 'redirect', redirectTo: to });

  // Tutoría ficticia mañana a las 08:00 (hora de Ecuador, UTC−5).
  const local = new Date(Date.now() - 5 * 3600_000 + 24 * 3600_000);
  const date = local.toISOString().slice(0, 10);
  const startsAt = new Date(`${date}T13:00:00.000Z`).toISOString();
  const endsAt = new Date(`${date}T13:40:00.000Z`).toISOString();

  const event: TutoringEvent = {
    id: `prueba-${Date.now()}`,
    type: 'tutoring.scheduled',
    aggregateId: 'prueba-correo',
    occurredAt: new Date().toISOString(),
    payload: {
      session: {
        id: `prueba-${Date.now()}`,
        status: 'SCHEDULED',
        date,
        startTime: '08:00',
        endTime: '08:40',
        startsAt,
        endsAt,
        location: 'Aula 204 · Bloque B (PRUEBA)',
        subject: 'Matemáticas',
        level: '9.º EGB',
        parallel: 'A',
        autoCompleted: false,
        startedAt: null,
        cancelReason: null,
      },
      teacher: { id: 't', name: 'Docente de Prueba', email: 'docente.prueba@ejemplo.test' },
      students: [
        {
          id: 's1',
          enrollmentId: 'e1',
          name: 'Estudiante de Prueba',
          enrollmentStatus: 'ENROLLED',
          attendance: null,
          guardians: [{ name: 'Representante de Prueba', email: 'representante.prueba@ejemplo.test', relationship: 'Madre' }],
        },
      ],
      report: null,
    },
  };

  const plan = planNotifications(event, [], {
    portalUrl: cfg.portalUrl,
    organizerEmail: 'noreply@uets.edu.ec',
    organizerName: 'Sistema DECE UETS',
    sequence: Math.floor(Date.now() / 1000),
  });

  for (const email of plan.emails) {
    const status = await sender.send(email);
    console.log(`${status}: [${email.audience}] "${email.subject}" → ${to} (original: ${email.to})`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(`Error: ${(e as Error).message}`);
  process.exit(1);
});
