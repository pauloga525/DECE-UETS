/**
 * Invitación de calendario iCalendar (RFC 5545). Adjunta como text/calendar con
 * METHOD:REQUEST, Gmail muestra "Agregar a Google Calendar" y crea el evento con su
 * recordatorio (pedido 7/9/2026: "para que recuerde el docente" — y los representantes).
 *
 * El UID es estable por tutoría: reprogramar/cancelar actualiza el MISMO evento en el
 * calendario del destinatario (SEQUENCE mayor), no crea duplicados.
 */
export interface CalendarInviteInput {
  method: 'REQUEST' | 'CANCEL';
  sessionId: string;
  startsAt: string; // ISO UTC
  endsAt: string;
  summary: string;
  description: string;
  location: string | null;
  organizerEmail: string;
  organizerName: string;
  attendee: { email: string; name: string };
  sequence: number;
  reminderMinutes?: number;
}

export function calendarUid(sessionId: string) {
  return `tutoria-${sessionId}@uets.edu.ec`;
}

function icsDate(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Escapa texto según RFC 5545 §3.3.11. */
export function icsText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Pliega líneas a 75 octetos (RFC 5545 §3.1), sin partir caracteres multibyte. */
export function foldLine(line: string) {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, 'utf8');
    const limit = out.length === 0 ? 75 : 74; // las continuaciones empiezan con un espacio
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function buildCalendarInvite(input: CalendarInviteInput): string {
  const cancel = input.method === 'CANCEL';
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//UETS//Sistema DECE//ES',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${input.method}`,
    'BEGIN:VEVENT',
    `UID:${calendarUid(input.sessionId)}`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTART:${icsDate(input.startsAt)}`,
    `DTEND:${icsDate(input.endsAt)}`,
    `SUMMARY:${icsText(input.summary)}`,
    `DESCRIPTION:${icsText(input.description)}`,
    ...(input.location ? [`LOCATION:${icsText(input.location)}`] : []),
    `ORGANIZER;CN=${icsText(input.organizerName)}:mailto:${input.organizerEmail}`,
    // RSVP=FALSE: el sistema no recibe correos, no se pide confirmación.
    `ATTENDEE;CN=${icsText(input.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${input.attendee.email}`,
    `STATUS:${cancel ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    ...(cancel
      ? []
      : [
          'BEGIN:VALARM',
          `TRIGGER:-PT${input.reminderMinutes ?? 30}M`,
          'ACTION:DISPLAY',
          `DESCRIPTION:${icsText(input.summary)}`,
          'END:VALARM',
        ]),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
