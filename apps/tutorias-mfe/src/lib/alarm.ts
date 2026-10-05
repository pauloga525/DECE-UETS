/**
 * Alarma de fin de tutoría (pedido 7/9/2026: "que suene al terminar").
 *
 * Se genera con Web Audio API (sin archivos de sonido). Los navegadores bloquean el audio
 * hasta que el usuario interactúa con la página, por eso `unlockAlarm()` debe llamarse desde
 * un clic — el botón "Iniciar tutoría" lo hace; como la app es una SPA, el contexto de audio
 * desbloqueado sigue vivo al pasar a la pantalla "en curso".
 */
let ctx: AudioContext | null = null;
let muted = false;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** Llamar dentro de un manejador de clic. */
export function unlockAlarm() {
  const c = context();
  if (c && c.state === 'suspended') void c.resume();
  // Pide permiso de notificaciones para avisar aunque la pestaña esté en segundo plano.
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

export function isAlarmReady() {
  return !!ctx && ctx.state === 'running';
}

export function setAlarmMuted(value: boolean) {
  muted = value;
}

export function isAlarmMuted() {
  return muted;
}

function beep(c: AudioContext, at: number, frequency: number, duration: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

/** Tres rondas de "bip-bip-bip" tipo cronómetro digital (~4 s). */
export function playAlarm() {
  if (muted) return;
  const c = context();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const t0 = c.currentTime + 0.05;
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 3; i++) beep(c, t0 + round * 1.2 + i * 0.22, 1760, 0.16);
  }
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.([300, 150, 300, 150, 600]);
}

/** Aviso del sistema operativo si la pestaña no está visible. */
export function notifyTimeUp(title: string, body: string) {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') return;
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(title, { body, tag: 'tutoria-fin' });
  }
}
