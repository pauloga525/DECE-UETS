'use client';

import { useEffect, useRef, useState } from 'react';
import { isAlarmMuted, isAlarmReady, notifyTimeUp, playAlarm, setAlarmMuted, unlockAlarm } from '@/lib/alarm';

const WARNING_MS = 5 * 60_000;

function format(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Cronómetro digital en cuenta regresiva hasta el fin del bloque (pedido 7/9/2026).
 *
 * Cuenta contra `endsAt` calculado por el servidor y corrige el desfase del reloj del equipo
 * con `serverNow`: si el docente recarga la página o entra tarde, el tiempo mostrado sigue
 * siendo el real. Al llegar a 0 suena la alarma una sola vez y llama a `onFinish`.
 */
export function Countdown({
  startsAt,
  endsAt,
  serverNow,
  onFinish,
}: {
  startsAt: string;
  endsAt: string;
  serverNow: string;
  onFinish?: () => void;
}) {
  // Diferencia entre el reloj del servidor y el del navegador, fijada al montar.
  const skew = useRef(new Date(serverNow).getTime() - Date.now());
  const end = new Date(endsAt).getTime();
  const total = end - new Date(startsAt).getTime();
  const [remaining, setRemaining] = useState(() => end - (Date.now() + skew.current));
  const [muted, setMuted] = useState(isAlarmMuted());
  const [soundReady, setSoundReady] = useState(isAlarmReady());
  const fired = useRef(remaining <= 0);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const id = window.setInterval(() => {
      const left = end - (Date.now() + skew.current);
      setRemaining(left);
      setSoundReady(isAlarmReady());
      if (left <= 0 && !fired.current) {
        fired.current = true;
        playAlarm();
        notifyTimeUp('Tutoría finalizada', 'Se cumplieron los 40 minutos. Completa el informe de cierre.');
        onFinishRef.current?.();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [end]);

  const done = remaining <= 0;
  const warning = !done && remaining <= WARNING_MS;
  const tone = done ? 'text-status-danger' : warning ? 'text-status-warning' : 'text-accent-ink';
  const ring = done ? 'stroke-status-danger' : warning ? 'stroke-status-warning' : 'stroke-accent';
  const progress = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 1;
  const R = 54;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-40 w-40" role="timer" aria-live="off" aria-label={`Tiempo restante ${format(remaining)}`}>
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={R} className="fill-none stroke-line" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r={R}
            className={`fill-none transition-[stroke-dashoffset] duration-300 ${ring}`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * progress}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-mono text-4xl font-medium tabular-nums ${tone} ${done ? 'animate-pulse' : ''}`}>
            {format(remaining)}
          </span>
          <span className="text-xs text-ink-soft">{done ? 'Tiempo cumplido' : warning ? 'Últimos minutos' : 'restante'}</span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-ink-soft">
        {!soundReady && !muted ? (
          <button onClick={() => { unlockAlarm(); setSoundReady(true); }} className="font-medium text-accent-ink underline">
            🔈 Activar sonido de alarma
          </button>
        ) : (
          <span>{muted ? '🔇 Alarma silenciada' : '🔈 Sonido activado'}</span>
        )}
        <button
          onClick={() => {
            setAlarmMuted(!muted);
            setMuted(!muted);
          }}
          className="underline hover:text-ink"
        >
          {muted ? 'Activar' : 'Silenciar'}
        </button>
        <button onClick={() => { unlockAlarm(); playAlarm(); }} className="underline hover:text-ink">
          Probar
        </button>
      </div>
    </div>
  );
}
