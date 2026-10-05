import { buildCalendarInvite } from './calendar-invite';
import { EmailBody, renderEmail } from './email-layout';
import { DeceMember, SessionSnapshot, StudentInfo, TutoringEvent } from './tutoring-event';

export interface OutgoingEmail {
  to: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
  calendar?: { method: 'REQUEST' | 'CANCEL'; content: string };
  /** Etiqueta para la bitácora: a quién iba dirigido (docente, representante, dece). */
  audience: 'teacher' | 'guardian' | 'dece';
}

export interface InAppNotification {
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
}

export interface NotificationPlan {
  emails: OutgoingEmail[];
  inApp: InAppNotification[];
}

export interface PlanContext {
  portalUrl: string;
  organizerEmail: string;
  organizerName: string;
  /** Monotónico para el SEQUENCE del .ics (el evento más reciente gana en el calendario). */
  sequence: number;
}

const ATTENDANCE_LABEL: Record<string, string> = {
  PRESENT: 'Asistió',
  ABSENT: 'No asistió',
  JUSTIFIED: 'Falta justificada',
};

function formatDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('es-EC', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function sessionDetails(s: SessionSnapshot, extra: [string, string][] = []): [string, string][] {
  const { session, teacher } = s;
  return [
    ['Materia', `${session.subject} · ${session.level}${session.parallel ? ` "${session.parallel}"` : ''}`],
    ['Fecha', formatDate(session.date)],
    ['Horario', `${session.startTime} – ${session.endTime} (40 minutos)`],
    ['Lugar', session.location ?? 'Por confirmar'],
    ['Docente', teacher.name],
    ...extra,
  ];
}

function summary(s: SessionSnapshot) {
  return `Tutoría de ${s.session.subject} · ${s.session.level}`;
}

function activeStudents(s: SessionSnapshot) {
  return s.students.filter((st) => st.enrollmentStatus !== 'CANCELLED');
}

function absentStudents(s: SessionSnapshot, onlyIds?: string[]) {
  return s.students.filter(
    (st) => (st.attendance === 'ABSENT' || st.enrollmentStatus === 'ABSENT') && (!onlyIds || onlyIds.includes(st.id)),
  );
}

/**
 * Agrupa por representante: un representante con dos hijos en la misma tutoría recibe UN
 * correo que menciona a ambos.
 */
function byGuardian(students: StudentInfo[]) {
  const map = new Map<string, { name: string; email: string; students: StudentInfo[] }>();
  for (const st of students) {
    for (const g of st.guardians) {
      const key = g.email.toLowerCase();
      const entry = map.get(key) ?? { name: g.name, email: g.email, students: [] };
      entry.students.push(st);
      map.set(key, entry);
    }
  }
  return [...map.values()];
}

function names(students: StudentInfo[]) {
  return students.map((s) => s.name).join(', ');
}

function withParallel(st: StudentInfo) {
  return st.parallel ? `${st.name} (${st.parallel})` : st.name;
}

/**
 * Matriz de destinatarios (plan, Fase C — pedidos 7/9/2026):
 *
 * | Evento                 | Docente        | Representantes            | DECE correo | DECE sistema |
 * | creada / inscritos     | ✉ + .ics       | ✉ + .ics                  |             |              |
 * | iniciada               |                | ✉                         | ✉           |              |
 * | finalizada / informe   |                | ✉ (resumen, tareas)       | ✉ (obs.)    | 🔔           |
 * | ausentes               |                | ✉ (del ausente)           | ✉           | 🔔           |
 * | no realizada           |                |                           | ✉           | 🔔           |
 * | cancelada/reprogramada | ✉ + .ics       | ✉ + .ics                  |             |              |
 */
export function planNotifications(event: TutoringEvent, dece: DeceMember[], ctx: PlanContext): NotificationPlan {
  const s = event.payload;
  const emails: OutgoingEmail[] = [];
  const inApp: InAppNotification[] = [];
  const link = `${ctx.portalUrl.replace(/\/$/, '')}/tutorias/sesiones/${s.session.id}`;

  const invite = (method: 'REQUEST' | 'CANCEL', attendee: { email: string; name: string }, snapshot = s) => ({
    method,
    content: buildCalendarInvite({
      method,
      sessionId: snapshot.session.id,
      startsAt: snapshot.session.startsAt,
      endsAt: snapshot.session.endsAt,
      summary: summary(snapshot),
      description:
        `${summary(snapshot)}\nDocente: ${snapshot.teacher.name}\nLugar: ${snapshot.session.location ?? 'Por confirmar'}\n\n` +
        'Invitación automática del Sistema DECE (UETS). No responda a este correo.',
      location: snapshot.session.location,
      organizerEmail: ctx.organizerEmail,
      organizerName: ctx.organizerName,
      attendee,
      sequence: ctx.sequence,
    }),
  });

  const push = (audience: OutgoingEmail['audience'], to: { email: string; name: string }, subject: string, body: EmailBody, calendar?: OutgoingEmail['calendar']) => {
    emails.push({ audience, to: to.email, toName: to.name, subject, ...renderEmail(body), calendar });
  };

  const toDece = (subject: string, body: EmailBody, notification?: { type: string; title: string; message: string }) => {
    for (const m of dece) {
      push('dece', { email: m.email, name: m.fullName ?? m.email }, subject, body);
      if (notification) inApp.push({ userId: m.id, ...notification, link });
    }
  };

  switch (event.type) {
    case 'tutoring.scheduled': {
      const students = activeStudents(s);
      push(
        'teacher',
        { email: s.teacher.email, name: s.teacher.name },
        `Nueva tutoría: ${s.session.subject} · ${s.session.date} ${s.session.startTime}`,
        {
          heading: 'Tienes una tutoría programada',
          intro: 'Se programó una tutoría a tu cargo. Agrégala a tu Google Calendar desde este correo para recibir el recordatorio.',
          details: sessionDetails(s, [['Estudiantes', `${students.length}`]]),
          list: { title: 'Estudiantes asignados', items: students.map((st) => st.name) },
          callToAction: { label: 'Ver en el sistema', url: link },
        },
        invite('REQUEST', { email: s.teacher.email, name: s.teacher.name }),
      );
      guardianInvites(students);
      break;
    }

    case 'tutoring.enrollments_added':
      guardianInvites(activeStudents(s).filter((st) => event.payload.studentIds?.includes(st.id)));
      break;

    case 'tutoring.started': {
      // Lista tomada al iniciar (pedido 2026-10-02): marcado = asistió, no marcado = ausente.
      const students = activeStudents(s);
      const present = (st: StudentInfo) => st.attendance === 'PRESENT' || st.enrollmentStatus === 'ATTENDED';
      const rollTaken = students.some((st) => st.attendance !== null);
      toDece(`Tutoría iniciada: ${s.session.subject} · ${s.teacher.name}`, {
        heading: 'Tutoría iniciada',
        intro: `${s.teacher.name} inició la tutoría${rollTaken ? ' y tomó lista' : ''}.`,
        details: sessionDetails(s),
        list: {
          title: 'Asistencia al inicio',
          items: students.map(
            (st) => `${withParallel(st)}: ${rollTaken ? (present(st) ? 'Asistió' : 'Ausente') : 'Sin registro'}`,
          ),
        },
        callToAction: { label: 'Ver en el sistema', url: link },
      });
      for (const g of byGuardian(students)) {
        const absent = rollTaken ? g.students.filter((st) => !present(st)) : [];
        const attended = g.students.filter((st) => !absent.includes(st));
        push(
          'guardian',
          g,
          absent.length ? `Ausente al inicio de la tutoría: ${names(absent)}` : `Tutoría en curso: ${names(g.students)}`,
          {
            heading: absent.length ? 'Ausencia al inicio de la tutoría' : 'La tutoría comenzó',
            intro: [
              attended.length ? `${names(attended)} ${attended.length > 1 ? 'asistieron' : 'asistió'} al inicio de la tutoría.` : '',
              absent.length ? `${names(absent)} no se ${absent.length > 1 ? 'presentaron' : 'presentó'} al inicio de la tutoría (registrado como ausente).` : '',
            ]
              .filter(Boolean)
              .join(' ') || `La tutoría de ${names(g.students)} acaba de iniciar.`,
            details: sessionDetails(
              s,
              rollTaken ? g.students.map((st) => [st.name, present(st) ? 'Asistió' : 'Ausente'] as [string, string]) : [],
            ),
            tone: absent.length ? 'alert' : 'default',
          },
        );
      }
      break;
    }

    case 'tutoring.completed':
      closing({ notifyAbsences: true });
      break;

    case 'tutoring.report_submitted':
      // Las faltas ya se avisaron cuando el sistema la cerró automáticamente.
      closing({ notifyAbsences: !s.session.autoCompleted });
      break;

    case 'tutoring.auto_closed': {
      if (event.payload.notStarted) {
        toDece(
          `Tutoría no realizada: ${s.session.subject} · ${s.teacher.name}`,
          {
            heading: 'La tutoría no se realizó',
            intro: `El bloque terminó sin que ${s.teacher.name} iniciara la tutoría. El sistema la cerró automáticamente.`,
            details: sessionDetails(s, [['Estudiantes', names(activeStudents(s)) || '—']]),
            callToAction: { label: 'Ver en el sistema', url: link },
            tone: 'alert',
          },
          {
            type: 'TUTORING_NOT_HELD',
            title: 'Tutoría no realizada',
            message: `${s.session.subject} · ${s.session.date} ${s.session.startTime} — ${s.teacher.name} no la inició.`,
          },
        );
      } else {
        absences(absentStudents(s), 'Cerrada automáticamente al cumplirse los 40 minutos. El informe del docente está pendiente.');
      }
      break;
    }

    case 'tutoring.cancelled': {
      const students = s.students; // las inscripciones ya figuran canceladas
      const reason = s.session.cancelReason ?? '—';
      push(
        'teacher',
        { email: s.teacher.email, name: s.teacher.name },
        `Tutoría cancelada: ${s.session.subject} · ${s.session.date} ${s.session.startTime}`,
        { heading: 'Tutoría cancelada', intro: 'Esta tutoría fue cancelada.', details: sessionDetails(s, [['Motivo', reason]]), tone: 'alert' },
        invite('CANCEL', { email: s.teacher.email, name: s.teacher.name }),
      );
      for (const g of byGuardian(students)) {
        push(
          'guardian',
          g,
          `Tutoría cancelada: ${names(g.students)}`,
          {
            heading: 'Tutoría cancelada',
            intro: `La tutoría de ${names(g.students)} fue cancelada.`,
            details: sessionDetails(s, [['Motivo', reason]]),
            tone: 'alert',
          },
          invite('CANCEL', { email: g.email, name: g.name }),
        );
      }
      break;
    }

    case 'tutoring.rescheduled': {
      const prev = event.payload.previous;
      const prevText = prev ? `${formatDate(prev.date)}, ${prev.startTime} – ${prev.endTime}` : '—';
      const students = activeStudents(s);
      const recipients: { audience: OutgoingEmail['audience']; email: string; name: string; who: string }[] = [
        { audience: 'teacher', email: s.teacher.email, name: s.teacher.name, who: 'La tutoría' },
        ...byGuardian(students).map((g) => ({ audience: 'guardian' as const, email: g.email, name: g.name, who: `La tutoría de ${names(g.students)}` })),
      ];
      for (const r of recipients) {
        push(
          r.audience,
          r,
          `Tutoría reprogramada: ${s.session.subject} · ${s.session.date} ${s.session.startTime}`,
          {
            heading: 'Tutoría reprogramada',
            intro: `${r.who} cambió de horario. Actualice su calendario con la nueva invitación.`,
            details: sessionDetails(s, [['Horario anterior', prevText]]),
          },
          invite('REQUEST', { email: r.email, name: r.name }),
        );
        // Retira del calendario el evento del horario anterior (otro UID).
        if (prev) {
          const old: SessionSnapshot = { ...s, session: { ...s.session, id: prev.sessionId } };
          push(
            r.audience,
            r,
            `Horario anterior cancelado: ${s.session.subject} · ${prev.date} ${prev.startTime}`,
            { heading: 'Horario anterior cancelado', intro: 'Se retira de su calendario el horario anterior de esta tutoría.', details: [['Horario anterior', prevText]] },
            invite('CANCEL', { email: r.email, name: r.name }, old),
          );
        }
      }
      break;
    }
  }

  return { emails, inApp };

  function guardianInvites(students: StudentInfo[]) {
    for (const g of byGuardian(students)) {
      push(
        'guardian',
        g,
        `Tutoría programada para ${names(g.students)}`,
        {
          heading: 'Tutoría programada',
          intro: `Se programó una tutoría académica para ${names(g.students)}. Puede agregarla a su Google Calendar desde este correo para recibir un recordatorio.`,
          details: sessionDetails(s),
        },
        invite('REQUEST', { email: g.email, name: g.name }),
      );
    }
  }

  function absences(absent: StudentInfo[], note: string) {
    if (absent.length === 0) return;
    toDece(
      `Inasistencias en tutoría: ${s.session.subject} · ${s.session.date}`,
      {
        heading: 'Estudiantes que no asistieron',
        intro: note,
        details: sessionDetails(s),
        list: { title: 'No asistieron', items: absent.map(withParallel) },
        callToAction: { label: 'Ver en el sistema', url: link },
        tone: 'alert',
      },
      {
        type: 'TUTORING_ABSENCES',
        title: 'Inasistencias en tutoría',
        message: `${names(absent)} — ${s.session.subject} · ${s.session.date} ${s.session.startTime}`,
      },
    );
    for (const g of byGuardian(absent)) {
      push('guardian', g, `Inasistencia a tutoría: ${names(g.students)}`, {
        heading: 'Inasistencia a tutoría',
        intro: `Le informamos que ${names(g.students)} no asistió a la tutoría programada.`,
        details: sessionDetails(s),
        tone: 'alert',
      });
    }
  }

  function closing({ notifyAbsences }: { notifyAbsences: boolean }) {
    const students = activeStudents(s);
    const report = s.report;
    const attendanceList = students.map((st) => `${withParallel(st)}: ${ATTENDANCE_LABEL[st.attendance ?? ''] ?? 'Sin registro'}`);
    toDece(
      `Tutoría finalizada: ${s.session.subject} · ${s.teacher.name}`,
      {
        heading: 'Tutoría finalizada',
        intro: `${s.teacher.name} registró el cierre de la tutoría.`,
        details: sessionDetails(s),
        list: { title: 'Asistencia', items: attendanceList },
        sections: report
          ? [
              { title: 'Destrezas trabajadas', body: report.skills },
              { title: 'Observaciones', body: report.observations },
              { title: 'Tareas asignadas', body: report.tasks || '—' },
            ]
          : [],
        callToAction: { label: 'Ver en el sistema', url: link },
      },
      {
        type: 'TUTORING_COMPLETED',
        title: 'Tutoría finalizada',
        message: `${s.session.subject} · ${s.session.date} ${s.session.startTime} — ${report?.observations.slice(0, 140) ?? ''}`,
      },
    );
    const absentIds = new Set(absentStudents(s).map((a) => a.id));
    for (const g of byGuardian(students)) {
      // Si el representado faltó y ya corresponde avisarlo, ese correo lo cubre absences().
      const present = g.students.filter((st) => !(notifyAbsences && absentIds.has(st.id)));
      if (present.length === 0) continue;
      push('guardian', { email: g.email, name: g.name }, `Tutoría finalizada: ${names(present)}`, {
        heading: 'Tutoría finalizada',
        intro: `La tutoría de ${names(present)} finalizó. Este es el resumen del docente.`,
        details: sessionDetails(s, present.map((st) => [st.name, ATTENDANCE_LABEL[st.attendance ?? ''] ?? 'Sin registro'] as [string, string])),
        sections: report
          ? [
              { title: 'Destrezas trabajadas', body: report.skills },
              { title: 'Tareas asignadas', body: report.tasks || 'Sin tareas asignadas' },
            ]
          : [],
      });
    }
    if (notifyAbsences) absences(absentStudents(s), 'Registrado por el docente al finalizar la tutoría.');
  }
}
