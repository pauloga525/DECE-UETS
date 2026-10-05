import type { SessionStatus } from '@/lib/types';
import { SESSION_STATUS_LABEL } from '@/lib/types';

const STATUS_CLASSES: Record<SessionStatus, string> = {
  AVAILABLE: 'bg-accent-tint text-accent-ink',
  SCHEDULED: 'bg-status-scheduled-tint text-status-scheduled',
  IN_PROGRESS: 'bg-status-warning-tint text-status-warning',
  COMPLETED: 'bg-status-inactive-tint text-status-inactive',
  CANCELLED: 'bg-status-danger-tint text-status-danger',
};

// Accesibilidad (sección 9.6): nunca solo color — siempre color + texto.
export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {SESSION_STATUS_LABEL[status]}
    </span>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'danger' | 'waitlist';
}) {
  const toneClasses = {
    neutral: 'bg-status-inactive-tint text-status-inactive',
    accent: 'bg-accent-tint text-accent-ink',
    danger: 'bg-status-danger-tint text-status-danger',
    waitlist: 'bg-status-waitlist-tint text-status-waitlist',
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses}`}>
      {children}
    </span>
  );
}
