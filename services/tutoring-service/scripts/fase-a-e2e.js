// E2E Fase A contra la instancia aislada (identity :4101, tutoring :4102, BD dece_verify).
// Uso: levantar identity y tutoring contra una BD DE PRUEBA (crea y borra datos) y correr:
//   E2E_DATABASE_URL=... IDENTITY_API=http://localhost:4101/api TUTORING_API=http://localhost:4102/api node scripts/fase-a-e2e.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: process.env.E2E_DATABASE_URL });
const ID = process.env.IDENTITY_API ?? 'http://localhost:4101/api';
const TU = process.env.TUTORING_API ?? 'http://localhost:4102/api';
if (!process.env.E2E_DATABASE_URL) throw new Error('Definí E2E_DATABASE_URL (nunca la base con datos reales)');

let fails = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails++;
}
async function token(email) {
  const r = await fetch(`${ID}/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  return (await r.json()).accessToken;
}
async function call(tok, method, p, body) {
  const r = await fetch(`${TU}${p}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const now = new Date();
  const localMs = now.getTime() - 300 * 60000; // Ecuador UTC-5
  const local = new Date(localMs);
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();

  const carlos = await prisma.teacher.findUniqueOrThrow({ where: { email: 'carlos@uets.edu.ec' } });
  const assignment = await prisma.teacherAssignment.findFirstOrThrow({ where: { teacherId: carlos.id }, include: { level: true } });
  const parallel = await prisma.parallel.findFirstOrThrow({ where: { levelId: assignment.levelId } });
  const mkStudent = (n) => prisma.student.upsert({
    where: { identification: `E2E-${n}` }, update: {},
    create: { firstName: `Est${n}`, lastName: 'Prueba', identification: `E2E-${n}`, levelId: assignment.levelId, parallelId: parallel.id },
  });
  const [sA, sB, sC, sD] = await Promise.all([1, 2, 3, 4].map(mkStudent));

  // Limpia sesiones de prueba previas de hoy (solo en la BD de prueba).
  const old = await prisma.tutoringSession.findMany({ where: { teacherId: carlos.id, date: day }, select: { id: true } });
  const oldIds = old.map((o) => o.id);
  await prisma.tutoringReport.deleteMany({ where: { tutoringSessionId: { in: oldIds } } });
  await prisma.attendance.deleteMany({ where: { enrollment: { tutoringSessionId: { in: oldIds } } } });
  await prisma.tutoringEnrollment.deleteMany({ where: { tutoringSessionId: { in: oldIds } } });
  await prisma.waitlist.deleteMany({ where: { tutoringSessionId: { in: oldIds } } });
  await prisma.tutoringSession.deleteMany({ where: { id: { in: oldIds } } });

  const base = { teacherId: carlos.id, subjectId: assignment.subjectId, levelId: assignment.levelId, teacherAssignmentId: assignment.id, academicPeriodId: assignment.academicPeriodId, date: day };
  const S1 = await prisma.tutoringSession.create({ data: { ...base, startTime: hhmm(nowMin - 5), endTime: hhmm(nowMin + 2) } });
  const S2 = await prisma.tutoringSession.create({ data: { ...base, startTime: hhmm(nowMin + 60), endTime: hhmm(nowMin + 100) } });
  const S3 = await prisma.tutoringSession.create({ data: { ...base, startTime: hhmm(nowMin - 3), endTime: hhmm(nowMin + 37) } });

  const tCarlos = await token('carlos@uets.edu.ec');
  const tDece = await token('dece@uets.edu.ec');
  const tOther = await token('jheisonzl@uets.edu.ec');
  const stu = (s) => ({ studentId: s.id, reason: 'ACADEMIC_REINFORCEMENT' });

  let r = await call(tOther, 'POST', `/tutoring/sessions/${S1.id}/schedule`, { parallelId: parallel.id, location: 'Aula 1', students: [stu(sA)] });
  check('R1 docente NO puede agendar tutoría de otro docente', r.status === 403, `${r.status} ${r.json?.message}`);

  r = await call(tCarlos, 'POST', `/tutoring/sessions/${S1.id}/schedule`, { parallelId: parallel.id, students: [stu(sA)] });
  check('R4 lugar obligatorio al agendar', r.status === 400, `${r.status}`);

  r = await call(tCarlos, 'POST', `/tutoring/sessions/${S1.id}/schedule`, { parallelId: parallel.id, location: 'Aula 204', students: [stu(sA), stu(sB)] });
  check('R1 docente agenda SU propia tutoría con lugar', r.status === 201 && r.json?.location === 'Aula 204', `${r.status} ${r.json?.message ?? ''}`);

  r = await call(tCarlos, 'POST', `/tutoring/sessions/${S3.id}/schedule`, { parallelId: parallel.id, location: 'Biblioteca', students: [stu(sC)] });
  check('docente agenda segunda tutoría propia', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);

  r = await call(tDece, 'POST', `/tutoring/sessions/${S2.id}/schedule`, { parallelId: parallel.id, location: 'Sala DECE', students: [stu(sD)] });
  check('R1 DECE agenda tutoría de cualquier docente', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);

  r = await call(tCarlos, 'POST', `/tutoring/sessions/${S2.id}/start`);
  check('no se puede iniciar fuera de horario', r.status === 409, r.json?.message);

  r = await call(tOther, 'POST', `/tutoring/sessions/${S1.id}/start`);
  check('otro docente no puede iniciar la tutoría', r.status === 403, `${r.status}`);

  r = await call(tCarlos, 'POST', `/tutoring/sessions/${S1.id}/start`);
  check('docente inicia su tutoría en horario', r.status === 201 && r.json?.status === 'IN_PROGRESS', `${r.status} ${r.json?.message ?? ''}`);

  r = await call(tCarlos, 'POST', `/tutoring/sessions/${S3.id}/start`);
  check('R8 no puede iniciar otra con una en curso', r.status === 409, r.json?.message);

  const detail = await call(tCarlos, 'GET', `/tutoring/sessions/${S1.id}`);
  check('detalle trae timing para el cronómetro', !!detail.json?.timing?.endsAt, JSON.stringify(detail.json?.timing));
  const enrA = detail.json.enrollments.find((e) => e.studentId === sA.id);
  const enrB = detail.json.enrollments.find((e) => e.studentId === sB.id);

  r = await call(tCarlos, 'POST', `/tutoring/sessions/${S1.id}/attendance`, { records: [{ enrollmentId: enrA.id, status: 'PRESENT' }] });
  check('R5 toma de lista parcial en curso', r.status === 201, `${r.status}`);

  r = await call(tCarlos, 'POST', `/tutoring/sessions/${S1.id}/complete`, { report: { skills: 'Ecuaciones', observations: 'Bien' } });
  check('no se puede finalizar con lista incompleta', r.status === 400, r.json?.message);

  console.log('… esperando cierre automático de S1 (fin + ciclo del cron)');
  const endsAt = new Date(detail.json.timing.endsAt).getTime();
  await sleep(Math.max(0, endsAt - Date.now()) + 65_000);

  const after = await prisma.tutoringSession.findUnique({ where: { id: S1.id }, include: { enrollments: { include: { attendance: true } } } });
  check('R7 cierre automático al cumplir el bloque', after.status === 'COMPLETED' && after.autoCompleted, `${after.status} auto=${after.autoCompleted}`);
  const bAfter = after.enrollments.find((e) => e.studentId === sB.id);
  check('R7 no registrados quedan ausentes', bAfter.status === 'ABSENT' && bAfter.attendance?.status === 'ABSENT', bAfter.status);

  r = await call(tCarlos, 'POST', `/tutoring/sessions/${S1.id}/report`, {
    records: [{ enrollmentId: enrB.id, status: 'JUSTIFIED' }],
    report: { skills: 'Ecuaciones lineales', observations: 'Participación activa', tasks: 'Ejercicios 1-10' },
  });
  check('R6 informe pendiente + corrección de asistencia', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  r = await call(tCarlos, 'POST', `/tutoring/sessions/${S1.id}/report`, { report: { skills: 'x x x', observations: 'y y y' } });
  check('informe no se registra dos veces', r.status === 409, `${r.status}`);

  r = await call(tCarlos, 'POST', `/tutoring/sessions/${S3.id}/start`);
  check('R8 tras cerrar la anterior ya puede iniciar', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  const d3 = await call(tCarlos, 'GET', `/tutoring/sessions/${S3.id}`);
  const enrC = d3.json.enrollments[0];
  r = await call(tCarlos, 'POST', `/tutoring/sessions/${S3.id}/complete`, {
    records: [{ enrollmentId: enrC.id, status: 'PRESENT' }],
    report: { skills: 'Lectura comprensiva', observations: 'Buen avance', tasks: '' },
  });
  check('R6 finalizar con lista completa e informe', r.status === 201 && r.json?.status === 'COMPLETED', `${r.status} ${r.json?.message ?? ''}`);
  const rep = await prisma.tutoringReport.findUnique({ where: { tutoringSessionId: S3.id } });
  check('informe guardado', rep?.skills === 'Lectura comprensiva');

  r = await call(tOther, 'POST', `/availability/rules`, { teacherAssignmentId: assignment.id, dayOfWeek: 'MONDAY', startTime: '14:00', endTime: '14:40' });
  check('R2 docente no puede cargar horario en asignación ajena', r.status === 403, `${r.status}`);

  const meC = await call(tCarlos, 'GET', `/teachers/me`);
  check('R2 docente ve su propia ficha (teachers/me)', meC.status === 200 && meC.json?.email === 'carlos@uets.edu.ec', `${meC.status}`);

  const audit = await prisma.auditLog.findFirst({ where: { entityId: S1.id, action: 'AUTO_COMPLETE' } });
  check('auditoría del cierre automático firmada por "system"', audit?.userId === 'system');

  console.log(fails ? `\n${fails} FALLA(S)` : '\nTODO OK');
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
