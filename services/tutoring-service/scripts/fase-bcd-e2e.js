// E2E de animador, representantes, correos (modo log) y campana, a través del API Gateway.
// Uso (SOLO contra una BD de prueba; crea y borra datos):
//   E2E_DATABASE_URL=postgresql://.../dece_verify?schema=public GATEWAY=http://localhost:4000/api node scripts/fase-bcd-e2e.js
const { PrismaClient } = require('@prisma/client');
if (!process.env.E2E_DATABASE_URL) throw new Error('Definí E2E_DATABASE_URL (nunca la base con datos reales)');
const base = process.env.E2E_DATABASE_URL.replace(/\?schema=.*/, '');
const tut = new PrismaClient({ datasourceUrl: `${base}?schema=public` });
const GW = process.env.GATEWAY ?? 'http://localhost:4000/api';

let fails = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(tok, method, p, body) {
  const r = await fetch(`${GW}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}
const token = async (email) => (await call(null, 'POST', '/identity/auth/dev-login', { email })).json?.accessToken;
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
async function emailLogs(sessionId) {
  return tut.$queryRawUnsafe(
    `SELECT l."eventType", l.audience, l."to", l.subject, l.status FROM notifications.email_logs l
     JOIN notifications.processed_events p ON p.id = l."eventId"
     WHERE l."eventId" IN (SELECT id FROM public.domain_events WHERE "aggregateId" = $1) ORDER BY l."createdAt"`,
    sessionId,
  );
}
async function waitFor(fn, ms = 40_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = await fn();
    if (v) return v;
    await sleep(1_000);
  }
  return null;
}

(async () => {
  const tAdmin = await token('pauloga@uets.edu.ec');
  const tDece = await token('anait@uets.edu.ec');
  const tCarlos = await token('carlos@uets.edu.ec');

  // ── Animador ───────────────────────────────────────────────────────────────────────
  const animEmail = 'animador.prueba@uets.edu.ec';
  let r = await call(tAdmin, 'POST', '/identity/users', { email: animEmail, role: 'ANIMATOR', fullName: 'Animador Prueba' });
  check('admin registra usuario con rol Animador', r.status === 201 || r.status === 409, `${r.status}`);

  const carlos = await tut.teacher.findUniqueOrThrow({ where: { email: 'carlos@uets.edu.ec' } });
  const assignment = await tut.teacherAssignment.findFirstOrThrow({ where: { teacherId: carlos.id } });
  const parallels = await tut.parallel.findMany({ where: { levelId: assignment.levelId }, orderBy: { name: 'asc' } });
  const [pA, pB] = parallels;
  r = await call(tAdmin, 'PATCH', `/tutorias/academic/parallels/${pA.id}`, { animatorEmail: animEmail.toUpperCase() });
  check('admin asigna animador al paralelo', r.status === 200 && r.json?.animatorEmail === animEmail, `${r.status} ${r.json?.animatorEmail}`);
  r = await call(tAdmin, 'PATCH', `/tutorias/academic/parallels/${pA.id}`, { animatorEmail: 'alguien@gmail.com' });
  check('animador debe ser @uets.edu.ec', r.status === 400, `${r.status}`);

  const tAnim = await token(animEmail);
  r = await call(tAnim, 'GET', '/tutorias/animator/courses');
  check('animador ve su curso', r.status === 200 && r.json.length === 1 && r.json[0].id === pA.id, `${r.status} ${r.json?.length}`);
  r = await call(tAnim, 'GET', '/tutorias/animator/students');
  const inCourse = r.json?.students ?? [];
  check('animador lista alumnos de su curso con tutorías', r.status === 200 && inCourse.length > 0 && inCourse.every((s) => s.total > 0), `${r.status} n=${inCourse.length}`);
  r = await call(tAnim, 'GET', `/tutorias/animator/students?parallelId=${pB.id}`);
  check('animador NO ve otro paralelo', r.status === 403, `${r.status}`);
  const other = await tut.student.findFirst({ where: { parallelId: { not: pA.id } } });
  if (other) {
    r = await call(tAnim, 'GET', `/tutorias/animator/students/${other.id}/history`);
    check('animador NO ve historial de alumno de otro curso', r.status === 403, `${r.status}`);
  }
  r = await call(tAnim, 'GET', `/tutorias/animator/students/${inCourse[0].id}/history`);
  check('animador ve historial de alumno de su curso', r.status === 200 && r.json.history.length > 0, `${r.status}`);
  r = await call(tAnim, 'GET', `/tutorias/reports/summary?parallelId=${pB.id}`);
  check('reporte de otro curso rechazado', r.status === 403, `${r.status}`);
  r = await call(tAnim, 'GET', '/tutorias/reports/summary');
  const all = await call(tAdmin, 'GET', '/tutorias/reports/summary');
  const own = await call(tAdmin, 'GET', `/tutorias/reports/summary?parallelId=${pA.id}`);
  check('reporte del animador = solo su curso', r.status === 200 && r.json.totalSessions === own.json.totalSessions, `anim=${r.json?.totalSessions} curso=${own.json?.totalSessions} total=${all.json?.totalSessions}`);
  r = await call(tAnim, 'GET', '/tutorias/reports/export.csv');
  check('animador descarga CSV de su curso', r.status === 200 && r.text.includes(','), `${r.status}`);
  r = await call(tAnim, 'GET', '/tutorias/tutoring/sessions');
  check('animador no accede a la agenda general', r.status === 403, `${r.status}`);

  // ── Representantes ─────────────────────────────────────────────────────────────────
  const student = await tut.student.findFirstOrThrow({ where: { identification: 'E2E-1' } });
  r = await call(tDece, 'GET', `/tutorias/students/${student.id}/guardians`);
  check('DECE ve representantes (datos de prueba)', r.status === 200 && r.json.length > 0 && r.json[0].guardian.email.endsWith('.test'), `${r.status}`);
  r = await call(tCarlos, 'GET', `/tutorias/students/${student.id}/guardians`);
  check('docente no ve datos de representantes', r.status === 403, `${r.status}`);

  // ── Correos (MAIL_MODE=log) y campana ──────────────────────────────────────────────
  const local = new Date(Date.now() - 300 * 60000);
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();
  const S = await tut.tutoringSession.create({
    data: {
      teacherId: carlos.id, subjectId: assignment.subjectId, levelId: assignment.levelId, teacherAssignmentId: assignment.id,
      academicPeriodId: assignment.academicPeriodId, date: day, startTime: hhmm(nowMin - 2), endTime: hhmm(nowMin + 38),
    },
  });
  const [e2, e3] = await tut.student.findMany({ where: { identification: { in: ['E2E-2', 'E2E-3'] } }, orderBy: { identification: 'asc' } });
  // Libera a los estudiantes de prueba de otras tutorías de prueba simultáneas (solape).
  await tut.tutoringEnrollment.updateMany({ where: { studentId: { in: [student.id, e2.id, e3.id] }, tutoringSession: { date: day, status: { in: ['SCHEDULED', 'IN_PROGRESS'] } } }, data: { status: 'CANCELLED' } });
  r = await call(tCarlos, 'POST', `/tutorias/tutoring/sessions/${S.id}/schedule`, {
    parallelId: student.parallelId, location: 'Aula 12', students: [student, e2, e3].map((s) => ({ studentId: s.id, reason: 'ACADEMIC_REINFORCEMENT' })),
  });
  check('docente agenda tutoría (dispara evento)', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);

  let logs = await waitFor(async () => { const l = await emailLogs(S.id); return l.some((x) => x.eventType === 'tutoring.scheduled') ? l : null; });
  const sched = (logs ?? []).filter((x) => x.eventType === 'tutoring.scheduled');
  check('creada: correo al docente', sched.some((x) => x.audience === 'teacher' && x.to === 'carlos@uets.edu.ec'));
  check('creada: correos a representantes', sched.filter((x) => x.audience === 'guardian').length >= 1, `n=${sched.filter((x) => x.audience === 'guardian').length}`);
  check('creada: modo log (no se envió nada real)', sched.every((x) => x.status === 'LOGGED'));
  check('creada: el DECE no recibe correo de creación', !sched.some((x) => x.audience === 'dece'));

  r = await call(tCarlos, 'POST', `/tutorias/tutoring/sessions/${S.id}/start`);
  check('docente inicia (dispara evento)', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  logs = await waitFor(async () => { const l = await emailLogs(S.id); return l.some((x) => x.eventType === 'tutoring.started') ? l : null; });
  const started = (logs ?? []).filter((x) => x.eventType === 'tutoring.started');
  check('iniciada: correos al DECE y representantes', started.some((x) => x.audience === 'dece') && started.some((x) => x.audience === 'guardian'), `n=${started.length}`);

  const det = await call(tCarlos, 'GET', `/tutorias/tutoring/sessions/${S.id}`);
  const enr = det.json.enrollments.filter((e) => e.status !== 'CANCELLED');
  r = await call(tCarlos, 'POST', `/tutorias/tutoring/sessions/${S.id}/complete`, {
    records: enr.map((e, i) => ({ enrollmentId: e.id, status: i === 0 ? 'ABSENT' : 'PRESENT' })),
    report: { skills: 'Fracciones equivalentes', observations: 'Grupo participativo', tasks: 'Taller página 12' },
  });
  check('docente finaliza con 1 falta (dispara evento)', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  logs = await waitFor(async () => { const l = await emailLogs(S.id); return l.some((x) => x.eventType === 'tutoring.completed') ? l : null; });
  const done = (logs ?? []).filter((x) => x.eventType === 'tutoring.completed');
  check('finalizada: DECE recibe cierre con observaciones', done.some((x) => x.audience === 'dece' && x.subject.startsWith('Tutoría finalizada')));
  check('finalizada: DECE recibe aviso de inasistencias', done.some((x) => x.audience === 'dece' && x.subject.startsWith('Inasistencias')));
  check('finalizada: representante del ausente recibe aviso', done.some((x) => x.audience === 'guardian' && x.subject.startsWith('Inasistencia')));

  r = await call(tDece, 'GET', '/notificaciones/notifications');
  const types = (r.json?.items ?? []).map((n) => n.type);
  check('campana del DECE: faltas y tutoría finalizada', r.status === 200 && types.includes('TUTORING_ABSENCES') && types.includes('TUTORING_COMPLETED'), `${r.status} ${types.slice(0, 4)}`);
  r = await call(tCarlos, 'GET', '/notificaciones/notifications');
  check('campana: el docente no recibe avisos del DECE', r.status === 200 && !r.json.items.some((n) => n.link?.includes(S.id)), `${r.status}`);

  // ── Seguridad del gateway ──────────────────────────────────────────────────────────
  r = await call(null, 'GET', '/identity/internal/users');
  check('gateway bloquea /internal de identity', r.status === 404, `${r.status}`);
  r = await call(null, 'POST', '/notificaciones/internal/events', {});
  check('gateway bloquea /internal de notificaciones', r.status === 404, `${r.status}`);

  console.log(fails ? `\n${fails} FALLA(S)` : '\nTODO OK');
  await tut.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error(e); await tut.$disconnect(); process.exit(1); });
