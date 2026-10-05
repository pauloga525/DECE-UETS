import { buildCalendarInvite, foldLine, icsText } from './calendar-invite';
import { planNotifications } from './notification-plan';
import { SessionSnapshot, TutoringEvent, TutoringEventType } from './tutoring-event';

const ctx = { portalUrl: 'http://portal', organizerEmail: 'noreply@uets.edu.ec', organizerName: 'Sistema DECE UETS', sequence: 100 };
const dece = [
  { id: 'u-coord', email: 'davidua@uets.edu.ec', fullName: 'Coordinador' },
  { id: 'u-psi', email: 'anait@uets.edu.ec', fullName: 'Psicóloga' },
];

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    session: {
      id: 's1',
      status: 'SCHEDULED',
      date: '2026-10-06',
      startTime: '08:00',
      endTime: '08:40',
      startsAt: '2026-10-06T13:00:00.000Z',
      endsAt: '2026-10-06T13:40:00.000Z',
      location: 'Aula 204',
      subject: 'Matemáticas',
      level: '9.º EGB',
      parallel: 'A',
      autoCompleted: false,
      startedAt: null,
      cancelReason: null,
    },
    teacher: { id: 't1', name: 'Carlos Andrade', email: 'carlos@uets.edu.ec' },
    students: [
      {
        id: 'a', enrollmentId: 'ea', name: 'Ana Ruiz', enrollmentStatus: 'ENROLLED', attendance: null,
        guardians: [{ name: 'Rosa Ruiz', email: 'rosa@ejemplo.test', relationship: 'Madre' }],
      },
      {
        id: 'b', enrollmentId: 'eb', name: 'Beto Ruiz', enrollmentStatus: 'ENROLLED', attendance: null,
        // Hermano: mismo representante → un solo correo para ambos.
        guardians: [{ name: 'Rosa Ruiz', email: 'ROSA@ejemplo.test', relationship: 'Madre' }],
      },
      {
        id: 'c', enrollmentId: 'ec', name: 'Carla Paz', enrollmentStatus: 'ENROLLED', attendance: null,
        guardians: [{ name: 'Luis Paz', email: 'luis@ejemplo.test', relationship: 'Padre' }],
      },
    ],
    report: null,
    ...overrides,
  };
}

function event(type: TutoringEventType, payload: SessionSnapshot, extra: Record<string, unknown> = {}): TutoringEvent {
  return { id: 'ev1', type, aggregateId: payload.session.id, occurredAt: '2026-10-01T00:00:00Z', payload: { ...payload, ...extra } };
}

describe('planNotifications — matriz de destinatarios', () => {
  it('tutoría creada: docente y representantes reciben invitación de calendario; el DECE no', () => {
    const plan = planNotifications(event('tutoring.scheduled', snapshot()), dece, ctx);
    const to = plan.emails.map((e) => e.to.toLowerCase());
    expect(to).toEqual(expect.arrayContaining(['carlos@uets.edu.ec', 'rosa@ejemplo.test', 'luis@ejemplo.test']));
    expect(to).not.toContain('davidua@uets.edu.ec');
    expect(plan.emails.every((e) => e.calendar?.method === 'REQUEST')).toBe(true);
    // Rosa representa a dos hermanos: un solo correo.
    expect(to.filter((t) => t === 'rosa@ejemplo.test')).toHaveLength(1);
    expect(plan.emails.find((e) => e.to.toLowerCase() === 'rosa@ejemplo.test')?.html).toContain('Ana Ruiz, Beto Ruiz');
    expect(plan.inApp).toHaveLength(0);
  });

  it('tutoría iniciada: DECE y representantes, sin invitación', () => {
    const plan = planNotifications(event('tutoring.started', snapshot()), dece, ctx);
    expect(plan.emails.filter((e) => e.audience === 'dece')).toHaveLength(2);
    expect(plan.emails.filter((e) => e.audience === 'guardian')).toHaveLength(2);
    expect(plan.emails.some((e) => e.audience === 'teacher')).toBe(false);
    expect(plan.emails.every((e) => !e.calendar)).toBe(true);
  });

  it('iniciada con lista: el representante del ausente recibe "ausente", el del presente "asistió"', () => {
    const s = snapshot({
      students: snapshot().students.map((st) =>
        st.id === 'c'
          ? { ...st, parallel: 'C', attendance: 'ABSENT', enrollmentStatus: 'ABSENT' }
          : { ...st, parallel: 'A', attendance: 'PRESENT', enrollmentStatus: 'ATTENDED' },
      ),
    });
    const plan = planNotifications(event('tutoring.started', s), dece, ctx);
    const luis = plan.emails.find((e) => e.to === 'luis@ejemplo.test');
    expect(luis?.subject).toContain('Ausente al inicio');
    const rosa = plan.emails.find((e) => e.to.toLowerCase() === 'rosa@ejemplo.test');
    expect(rosa?.subject).toContain('Tutoría en curso');
    expect(rosa?.html).toContain('asistieron');
    const deceMail = plan.emails.find((e) => e.audience === 'dece');
    expect(deceMail?.html).toContain('Carla Paz (C): Ausente');
    expect(deceMail?.html).toContain('Ana Ruiz (A): Asistió');
  });

  it('finalizada con falta: DECE recibe observaciones + aviso de faltas (correo y campana); el representante del ausente, aviso de inasistencia', () => {
    const s = snapshot({
      report: { skills: 'Ecuaciones', observations: 'Buen trabajo', tasks: 'Ejercicios 1-5' },
      students: snapshot().students.map((st) =>
        st.id === 'c'
          ? { ...st, attendance: 'ABSENT', enrollmentStatus: 'ABSENT' }
          : { ...st, attendance: 'PRESENT', enrollmentStatus: 'ATTENDED' },
      ),
    });
    const plan = planNotifications(event('tutoring.completed', s), dece, ctx);
    const deceMails = plan.emails.filter((e) => e.audience === 'dece');
    expect(deceMails.some((e) => e.subject.startsWith('Tutoría finalizada') && e.html.includes('Buen trabajo'))).toBe(true);
    expect(deceMails.some((e) => e.subject.startsWith('Inasistencias') && e.html.includes('Carla Paz'))).toBe(true);
    expect(plan.inApp.map((n) => n.type).sort()).toEqual(
      ['TUTORING_ABSENCES', 'TUTORING_ABSENCES', 'TUTORING_COMPLETED', 'TUTORING_COMPLETED'],
    );
    const luis = plan.emails.filter((e) => e.to === 'luis@ejemplo.test');
    expect(luis).toHaveLength(1);
    expect(luis[0].subject).toContain('Inasistencia');
    const rosa = plan.emails.find((e) => e.to.toLowerCase() === 'rosa@ejemplo.test');
    expect(rosa?.html).toContain('Ejercicios 1-5');
  });

  it('cerrada sin iniciar: solo el DECE (correo + campana "no realizada")', () => {
    const plan = planNotifications(event('tutoring.auto_closed', snapshot(), { notStarted: true }), dece, ctx);
    expect(plan.emails.every((e) => e.audience === 'dece')).toBe(true);
    expect(plan.inApp.every((n) => n.type === 'TUTORING_NOT_HELD')).toBe(true);
  });

  it('informe tras cierre automático: no repite el aviso de faltas', () => {
    const s = snapshot({
      session: { ...snapshot().session, autoCompleted: true },
      report: { skills: 'x', observations: 'y', tasks: null },
      students: snapshot().students.map((st) => ({ ...st, attendance: 'ABSENT', enrollmentStatus: 'ABSENT' })),
    });
    const plan = planNotifications(event('tutoring.report_submitted', s), dece, ctx);
    expect(plan.emails.some((e) => e.subject.startsWith('Inasistencia'))).toBe(false);
  });

  it('cancelada: docente y representantes con invitación CANCEL', () => {
    const s = snapshot({ students: snapshot().students.map((st) => ({ ...st, enrollmentStatus: 'CANCELLED' })) });
    const plan = planNotifications(event('tutoring.cancelled', s), dece, ctx);
    expect(plan.emails.length).toBe(3);
    expect(plan.emails.every((e) => e.calendar?.method === 'CANCEL')).toBe(true);
  });

  it('todos los correos indican que no se debe responder', () => {
    const plan = planNotifications(event('tutoring.scheduled', snapshot()), dece, ctx);
    for (const e of plan.emails) {
      expect(e.html).toContain('no responda a este mensaje');
      expect(e.text).toContain('No responda');
    }
  });
});

describe('invitación de calendario (.ics)', () => {
  const ics = buildCalendarInvite({
    method: 'REQUEST',
    sessionId: 's1',
    startsAt: '2026-10-06T13:00:00.000Z',
    endsAt: '2026-10-06T13:40:00.000Z',
    summary: 'Tutoría de Matemáticas, 9.º EGB',
    description: 'Línea 1\nLínea 2; con punto y coma',
    location: 'Aula 204',
    organizerEmail: 'noreply@uets.edu.ec',
    organizerName: 'Sistema DECE UETS',
    attendee: { email: 'rosa@ejemplo.test', name: 'Rosa Ruiz' },
    sequence: 7,
  });

  it('tiene UID estable, horas en UTC, recordatorio y sin pedir respuesta', () => {
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('UID:tutoria-s1@uets.edu.ec');
    expect(ics).toContain('DTSTART:20261006T130000Z');
    expect(ics).toContain('DTEND:20261006T134000Z');
    expect(ics).toContain('TRIGGER:-PT30M');
    expect(ics).toContain('RSVP=FALSE');
    expect(ics).toContain('SEQUENCE:7');
    expect(ics.includes('\r\n')).toBe(true);
  });

  it('escapa texto y pliega líneas largas a 75 octetos', () => {
    expect(icsText('a,b;c\nd')).toBe('a\\,b\\;c\\nd');
    const folded = foldLine('DESCRIPTION:' + 'ñ'.repeat(80));
    for (const part of folded.split('\r\n')) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
  });
});
