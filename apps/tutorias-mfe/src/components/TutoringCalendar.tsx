'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import esLocale from '@fullcalendar/core/locales/es';
import type { EventInput, EventSourceFuncArg, EventContentArg } from '@fullcalendar/core';
import { api } from '@/lib/api';
import type { SessionStatus, TutoringSession } from '@/lib/types';
import { SESSION_STATUS_LABEL } from '@/lib/types';
import { fullName } from '@/lib/format';

// Colores de estado del sistema de diseño (tailwind.config.ts → status.*).
const COLORS: Record<SessionStatus, { bg: string; border: string; text: string }> = {
  AVAILABLE: { bg: '#e4efec', border: '#1f6f5c', text: '#123f34' },
  SCHEDULED: { bg: '#e8eff8', border: '#3a6ea8', text: '#1f4470' },
  IN_PROGRESS: { bg: '#faf1e0', border: '#b5750c', text: '#7a4e06' },
  COMPLETED: { bg: '#eef0f1', border: '#6b7681', text: '#3d454c' },
  CANCELLED: { bg: '#f8e9e9', border: '#a83f3f', text: '#a83f3f' },
};

function toEvent(s: TutoringSession): EventInput {
  const day = s.date.slice(0, 10);
  const c = COLORS[s.status];
  const count = s.enrollments?.filter((e) => e.status !== 'CANCELLED').length ?? 0;
  return {
    id: s.id,
    // Hora local de la institución ("flotante"): el calendario la muestra tal cual.
    start: `${day}T${s.startTime}:00`,
    end: `${day}T${s.endTime}:00`,
    title: `${s.subject?.name ?? 'Tutoría'} · ${s.level?.name ?? ''}`,
    backgroundColor: c.bg,
    borderColor: c.border,
    textColor: c.text,
    classNames: s.status === 'CANCELLED' ? ['line-through', 'opacity-70'] : [],
    extendedProps: {
      status: s.status,
      teacher: s.teacher ? fullName(s.teacher) : '',
      location: s.location,
      seats: `${count}/${s.capacity}`,
      href: s.status === 'AVAILABLE' ? `/crear?sessionId=${s.id}` : `/sesiones/${s.id}`,
    },
  };
}

function EventBlock({ event, view }: EventContentArg) {
  const p = event.extendedProps as { status: SessionStatus; teacher: string; location: string | null; seats: string };
  const compact = view.type === 'dayGridMonth';
  return (
    <div className="overflow-hidden px-1 py-0.5 text-[11px] leading-tight">
      <div className="font-medium">
        {compact && <span className="mr-1 font-mono">{event.start?.toTimeString().slice(0, 5)}</span>}
        {event.title}
      </div>
      {!compact && (
        <>
          <div className="truncate opacity-80">{p.teacher}</div>
          <div className="truncate opacity-80">
            {SESSION_STATUS_LABEL[p.status]} · {p.seats}
            {p.location ? ` · ${p.location}` : ''}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Agenda con diseño tipo Google Calendar (pedido 7/9/2026): vistas mes / semana / día /
 * lista, colores por estado, clic en un bloque para abrirlo.
 */
export function TutoringCalendar({ teacherId, status }: { teacherId?: string; status?: SessionStatus | '' }) {
  const router = useRouter();
  const ref = useRef<FullCalendar>(null);

  const fetchEvents = useCallback(
    async (info: EventSourceFuncArg) => {
      const params = new URLSearchParams({ from: info.startStr.slice(0, 10), to: info.endStr.slice(0, 10) });
      if (teacherId) params.set('teacherId', teacherId);
      if (status) params.set('status', status);
      const sessions = await api.get<TutoringSession[]>(`/tutoring/sessions?${params.toString()}`);
      return sessions.map(toEvent);
    },
    [teacherId, status],
  );

  return (
    <div className="tutoring-calendar rounded-lg border border-line bg-white p-3 shadow-subtle">
      <FullCalendar
        ref={ref}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
        locale={esLocale}
        initialView="timeGridWeek"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' }}
        buttonText={{ today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día', list: 'Lista' }}
        firstDay={1}
        weekends={false}
        slotMinTime="07:00:00"
        slotMaxTime="18:00:00"
        slotDuration="00:20:00"
        slotLabelInterval="01:00"
        allDaySlot={false}
        nowIndicator
        height="auto"
        expandRows
        events={fetchEvents}
        eventContent={(arg) => <EventBlock {...arg} />}
        eventClick={(info) => {
          info.jsEvent.preventDefault();
          router.push(info.event.extendedProps.href as string);
        }}
        eventDidMount={(info) => {
          const p = info.event.extendedProps;
          info.el.title = `${info.event.title}\n${p.teacher}\n${SESSION_STATUS_LABEL[p.status as SessionStatus]} · ${p.seats}${p.location ? `\n${p.location}` : ''}`;
        }}
      />
    </div>
  );
}
