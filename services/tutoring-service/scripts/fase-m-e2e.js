// E2E 2026-11-24: motivo de inasistencia al tomar lista, motivo de tutoría no realizada y reportes
// "Inasistencias de estudiantes" / "Tutorías no realizadas" con la observación del docente.
// Uso (SOLO BD de prueba): E2E_DATABASE_URL=postgresql://.../copia?schema=public node scripts/fase-m-e2e.js
const { PrismaClient } = require('@prisma/client');
if (!process.env.E2E_DATABASE_URL) throw new Error('Definí E2E_DATABASE_URL');
if (/tutorias_dev/.test(process.env.E2E_DATABASE_URL)) throw new Error('No uses tutorias_dev: usa una copia');
const db = new PrismaClient({ datasourceUrl: process.env.E2E_DATABASE_URL });
const GW = process.env.GATEWAY ?? 'http://localhost:4000/api';

let fails = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails++;
};
async function call(tok, method, p, body) {
  const r = await fetch(`${GW}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = r.headers.get('content-type') ?? '';
  const json = type.includes('json') ? await r.json().catch(() => null) : Buffer.from(await r.arrayBuffer());
  return { status: r.status, json };
}
const login = async (email) => (await call(null, 'POST', '/identity/auth/dev-login', { email })).json?.accessToken;
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

(async () => {
  const admin = await login('pauloga@uets.edu.ec');
  const psych = (await db.$queryRaw`SELECT email FROM identity.users WHERE role::text = 'PSYCHOLOGIST' AND "isActive" LIMIT 1`)[0].email;
  const dece = await login(psych);

  // Tutoría de hoy, en horario, con 3 alumnos del docente
  // Un docente cuya cuenta tenga rol Docente (a algunos se les conservó otro rol).
  const teacherEmails = (await db.$queryRaw`SELECT email FROM identity.users WHERE role::text = 'TEACHER' AND "isActive"`).map((u) => u.email);
  const a = await db.teacherAssignment.findFirstOrThrow({
    where: {
      isActive: true,
      teacher: { isActive: true, email: { in: teacherEmails } },
      level: { students: { some: {} } },
      parallels: { some: {} },
    },
    include: { teacher: true, parallels: true },
  });
  const students = await db.student.findMany({
    where: { levelId: a.levelId, parallelId: { in: a.parallels.map((p) => p.parallelId) }, isActive: true }, take: 3,
  });
  const creator = (await db.user.findFirst({ where: { role: 'ADMIN' } })).id;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const S = await db.tutoringSession.create({
    data: {
      teacherId: a.teacherId, subjectId: a.subjectId, levelId: a.levelId, teacherAssignmentId: a.id, academicPeriodId: a.academicPeriodId,
      date: new Date(now.toISOString().slice(0, 10)), startTime: hhmm(nowMin - 2), endTime: hhmm(nowMin + 38),
      status: 'SCHEDULED', location: 'E2E', slotKey: 'e2e-m',
      enrollments: { create: students.map((s) => ({ studentId: s.id, reason: 'ACADEMIC_REINFORCEMENT', createdById: creator })) },
    },
    include: { enrollments: true },
  });
  const [e1, e2, e3] = S.enrollments;
  const tok = await login(a.teacher.email);

  // 1) Iniciar con lista: e1 presente, e2 y e3 ausentes; e2 con motivo
  let r = await call(tok, 'POST', `/tutorias/tutoring/sessions/${S.id}/start`, {
    presentEnrollmentIds: [e1.id],
    absenceNotes: [{ enrollmentId: e2.id, note: 'Cita médica, avisó la representante' }],
  });
  check('iniciar con motivo de inasistencia', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  let att = await db.attendance.findUnique({ where: { enrollmentId: e2.id } });
  check('el motivo queda guardado en la asistencia', att?.status === 'ABSENT' && att.note === 'Cita médica, avisó la representante');
  r = await call(tok, 'POST', `/tutorias/tutoring/sessions/${S.id}/start`, {
    presentEnrollmentIds: [], absenceNotes: [{ enrollmentId: e2.id, note: 'x'.repeat(301) }],
  });
  check('motivo de más de 300 caracteres: 400', r.status === 400, `${r.status}`);

  // 2) Finalizar: e3 recibe motivo, e2 conserva el suyo sin reenviarlo
  r = await call(tok, 'POST', `/tutorias/tutoring/sessions/${S.id}/complete`, {
    presentEnrollmentIds: [e1.id],
    absenceNotes: [{ enrollmentId: e3.id, note: 'Estaba en otra actividad del colegio' }],
    report: { skills: 'Fracciones', observations: 'Bien', tasks: '' },
  });
  check('finalizar con motivo de otro ausente', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  att = await db.attendance.findUnique({ where: { enrollmentId: e2.id } });
  const att3 = await db.attendance.findUnique({ where: { enrollmentId: e3.id } });
  check('el motivo anotado al iniciar se conserva al finalizar', att.note === 'Cita médica, avisó la representante');
  check('el motivo anotado al finalizar se guarda', att3.note === 'Estaba en otra actividad del colegio');

  // 3) Reporte de inasistencias
  r = await call(admin, 'GET', `/tutorias/reports/absences?teacherId=${a.teacherId}`);
  const rows = r.json.rows.filter((x) => x.sessionId === S.id);
  check('inasistencias: los 2 ausentes, con materia, docente y fecha', rows.length === 2 && rows.every((x) => x.subject && x.teacher && x.date),
    `${rows.length}`);
  check('inasistencias: la observación del docente', rows.some((x) => x.note === 'Cita médica, avisó la representante') && rows.some((x) => x.note === 'Estaba en otra actividad del colegio'));
  check('el presente no aparece', !rows.some((x) => x.enrollmentId === e1.id));
  const st = r.json.byStudent.find((x) => x.identification === students[1].identification);
  check('por estudiante: materia y docente de la inasistencia',
    st?.subjects.length >= 1 && st.subjects.every((x) => x.subject && x.teacher && x.absences >= 1) &&
      st.subjects.reduce((n, x) => n + x.absences, 0) === st.absences,
    JSON.stringify(st?.subjects));
  r = await call(admin, 'GET', '/tutorias/reports/absences');
  check('no incluye tutorías que no se realizaron', r.json.rows.every((x) => x.date));
  r = await call(admin, 'GET', '/tutorias/reports/absences.xlsx');
  check('inasistencias en Excel', r.status === 200 && r.json.subarray(0, 2).toString() === 'PK');
  r = await call(admin, 'GET', '/tutorias/reports/absences.pdf');
  check('inasistencias en PDF', r.status === 200 && r.json.subarray(0, 4).toString() === '%PDF');
  require('fs').writeFileSync(process.env.PDF_OUT ?? 'inasistencias.pdf', r.json);

  // 4) Motivo de una tutoría no realizada
  const notHeld = await db.tutoringSession.findFirstOrThrow({ where: { status: 'COMPLETED', startedAt: null }, include: { teacher: true } });
  const tokNH = await login(notHeld.teacher.email);
  r = await call(tokNH, 'POST', `/tutorias/tutoring/sessions/${notHeld.id}/not-held-reason`, { reason: 'Reunión convocada por rectorado' });
  check('el docente registra por qué no se realizó', r.status === 201 && r.json.notHeldReason === 'Reunión convocada por rectorado', `${r.status} ${r.json?.message ?? ''}`);
  r = await call(tokNH, 'POST', `/tutorias/tutoring/sessions/${notHeld.id}/not-held-reason`, { reason: 'abc' });
  check('motivo muy corto: 400', r.status === 400);
  r = await call(tok, 'POST', `/tutorias/tutoring/sessions/${S.id}/not-held-reason`, { reason: 'No aplica porque sí se dio' });
  check('en una tutoría que sí se realizó: 409', r.status === 409, `${r.status}`);
  if (a.teacherId !== notHeld.teacherId) {
    r = await call(tok, 'POST', `/tutorias/tutoring/sessions/${notHeld.id}/not-held-reason`, { reason: 'Motivo ajeno' });
    check('otro docente no puede registrarlo: 403', r.status === 403, `${r.status}`);
  }
  r = await call(dece, 'POST', `/tutorias/tutoring/sessions/${notHeld.id}/not-held-reason`, { reason: 'Motivo del DECE' });
  check('el DECE no lo registra por el docente: 403', r.status === 403, `${r.status}`);
  r = await call(tokNH, 'POST', `/tutorias/tutoring/sessions/${notHeld.id}/report`, {
    presentEnrollmentIds: [], report: { skills: 'x x x', observations: 'y y y' },
  });
  check('una no realizada no admite "informe pendiente": 409', r.status === 409, `${r.status} ${r.json?.message ?? ''}`);

  r = await call(admin, 'GET', '/tutorias/reports/unfulfilled?kind=NOT_HELD');
  const nh = r.json.rows.find((x) => x.id === notHeld.id);
  check('no realizadas: muestra la observación del docente', nh?.observation === 'Reunión convocada por rectorado');
  check('no realizadas: cuenta las que siguen sin observación', r.json.notHeldWithoutReason === r.json.rows.filter((x) => !x.observation).length,
    `${r.json.notHeldWithoutReason} de ${r.json.total}`);
  r = await call(admin, 'GET', '/tutorias/reports/unfulfilled.pdf');
  check('no realizadas en PDF', r.status === 200 && r.json.subarray(0, 4).toString() === '%PDF');
  require('fs').writeFileSync(process.env.PDF_OUT2 ?? 'no-realizadas.pdf', r.json);

  console.log(fails ? `\n${fails} FALLAS` : '\nTodo OK');
  await db.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
