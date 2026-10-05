// E2E 2026-10-05: lugar en el horario, tutoría con varios paralelos, lista al iniciar y al
// finalizar (correos asistió/ausente), registro por alumno y cupo de 10.
// Uso (SOLO BD de prueba; crea datos):
//   E2E_DATABASE_URL=postgresql://.../dece_verify?schema=public GATEWAY=http://localhost:4000/api node scripts/fase-e-e2e.js
const { PrismaClient } = require('@prisma/client');
if (!process.env.E2E_DATABASE_URL) throw new Error('Definí E2E_DATABASE_URL (nunca la base con datos reales)');
const db = new PrismaClient({ datasourceUrl: process.env.E2E_DATABASE_URL });
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
  const buf = Buffer.from(await r.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buf.toString('utf8')); } catch {}
  return { status: r.status, json, type: r.headers.get('content-type'), size: buf.length };
}
const token = async (email) => (await call(null, 'POST', '/identity/auth/dev-login', { email })).json?.accessToken;
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
async function logsFor(sessionId, type) {
  return db.$queryRawUnsafe(
    `SELECT l.audience, l."to", l.subject FROM notifications.email_logs l
     WHERE l."eventType" = $2 AND l."eventId" IN (SELECT id FROM public.domain_events WHERE "aggregateId" = $1)`,
    sessionId, type,
  );
}
// Espera a que el lote de correos del evento termine (el conteo deja de crecer).
async function waitLogs(sessionId, type) {
  let last = -1;
  for (let i = 0; i < 60; i++) {
    const l = await logsFor(sessionId, type);
    if (l.length && l.length === last) return l;
    last = l.length;
    await sleep(1500);
  }
  return logsFor(sessionId, type);
}

(async () => {
  const tCarlos = await token('carlos@uets.edu.ec');
  const tAdmin = await token('pauloga@uets.edu.ec');
  const carlos = await db.teacher.findUniqueOrThrow({ where: { email: 'carlos@uets.edu.ec' } });
  const assignment = await db.teacherAssignment.findFirstOrThrow({
    where: { teacherId: carlos.id, level: { name: '9.º EGB' } },
    include: { subject: true, level: true },
  });

  // ── 1. Lugar declarado en el horario ──────────────────────────────────────────────────
  const local = new Date(Date.now() - 300 * 60000);
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const nowMin = local.getUTCHours() * 60 + local.getUTCMinutes();
  const start = nowMin - 2;
  // Limpia horarios de corridas anteriores de esta prueba (se cruzarían con el nuevo).
  await db.teacherAvailabilityRule.deleteMany({ where: { teacherAssignmentId: assignment.id, location: { contains: 'E2E' } } });
  let r = await call(tCarlos, 'POST', '/tutorias/availability/rules', {
    teacherAssignmentId: assignment.id, dayOfWeek: DAYS[local.getUTCDay()], startTime: hhmm(start), endTime: hhmm(start + 40),
  });
  check('horario sin lugar es rechazado', r.status === 400, `${r.status}`);
  r = await call(tCarlos, 'POST', '/tutorias/availability/rules', {
    teacherAssignmentId: assignment.id, dayOfWeek: DAYS[local.getUTCDay()], startTime: hhmm(start), endTime: hhmm(start + 40),
    location: 'Aula 9 · Bloque E2E',
  });
  check('docente registra horario con lugar', r.status === 201 && r.json?.location === 'Aula 9 · Bloque E2E', `${r.status} ${r.json?.message ?? ''}`);
  await call(tCarlos, 'POST', '/tutorias/availability/generate');
  const block = await db.tutoringSession.findFirst({ where: { teacherId: carlos.id, date: day, startTime: hhmm(start) } });
  check('el bloque generado hereda el lugar', block?.location === 'Aula 9 · Bloque E2E', `${block?.location}`);
  check('el bloque generado tiene cupo 10', block?.capacity === 10, `${block?.capacity}`);

  // ── 2. Varios paralelos, cupo 10 ──────────────────────────────────────────────────────
  const parallels = await db.parallel.findMany({ where: { levelId: assignment.levelId, name: { in: ['A', 'B'] } } });
  const pick = async (pid, n) =>
    db.student.findMany({
      where: { parallelId: pid, isActive: true, enrollments: { none: { tutoringSession: { date: day } } } },
      take: n, orderBy: { lastName: 'asc' },
    });
  const studs = [...(await pick(parallels[0].id, 6)), ...(await pick(parallels[1].id, 5))];
  const asInput = (s) => ({ studentId: s.id, reason: 'ACADEMIC_REINFORCEMENT' });
  r = await call(tCarlos, 'POST', `/tutorias/tutoring/sessions/${block.id}/schedule`, { students: studs.map(asInput) });
  check('11 estudiantes: supera el cupo de 10', r.status === 400, `${r.status}`);
  const ten = studs.slice(0, 10);
  const otherLevel = await db.student.findFirst({ where: { levelId: { not: assignment.levelId }, isActive: true } });
  r = await call(tCarlos, 'POST', `/tutorias/tutoring/sessions/${block.id}/schedule`, { students: [asInput(otherLevel)] });
  check('alumno de otro nivel es rechazado', r.status === 400 && /nivel/.test(r.json?.message ?? ''), `${r.status} ${r.json?.message}`);
  r = await call(tCarlos, 'POST', `/tutorias/tutoring/sessions/${block.id}/schedule`, { students: ten.map(asInput) });
  check('agenda 10 estudiantes de 2 paralelos sin escribir lugar', r.status === 201 && r.json?.location === 'Aula 9 · Bloque E2E' && r.json?.parallelId === null,
    `${r.status} ${r.json?.message ?? ''} loc=${r.json?.location}`);

  const detail = await call(tCarlos, 'GET', `/tutorias/tutoring/sessions/${block.id}`);
  const enr = detail.json.enrollments;
  check('detalle trae el paralelo de cada alumno', enr.every((e) => e.student?.parallel?.name), [...new Set(enr.map((e) => e.student.parallel.name))].join(','));

  // ── 3. Lista al iniciar ────────────────────────────────────────────────────────────────
  const present7 = enr.slice(0, 7).map((e) => e.id);
  r = await call(tCarlos, 'POST', `/tutorias/tutoring/sessions/${block.id}/start`, { presentEnrollmentIds: present7 });
  check('inicia con lista', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  const att = await db.attendance.groupBy({ by: ['status'], where: { enrollment: { tutoringSessionId: block.id } }, _count: true });
  const cnt = Object.fromEntries(att.map((a) => [a.status, a._count]));
  check('al iniciar: 7 presentes y 3 ausentes', cnt.PRESENT === 7 && cnt.ABSENT === 3, JSON.stringify(cnt));
  const startLogs = await waitLogs(block.id, 'tutoring.started');
  check('correo de inicio: avisos de "ausente" a representantes', startLogs.some((l) => l.audience === 'guardian' && l.subject.startsWith('Ausente al inicio')), `n=${startLogs.length}`);
  check('correo de inicio: "en curso" a los que asistieron', startLogs.some((l) => l.audience === 'guardian' && l.subject.startsWith('Tutoría en curso')));

  // ── 4. Lista al finalizar ──────────────────────────────────────────────────────────────
  const present8 = enr.slice(0, 8).map((e) => e.id);
  r = await call(tCarlos, 'POST', `/tutorias/tutoring/sessions/${block.id}/complete`, {
    presentEnrollmentIds: present8,
    report: { skills: 'Ecuaciones', observations: 'Grupo mixto A/B', tasks: 'Ejercicios 1-10' },
  });
  check('finaliza con lista (8 presentes)', r.status === 201 && r.json?.status === 'COMPLETED', `${r.status} ${r.json?.message ?? ''}`);
  const att2 = await db.attendance.groupBy({ by: ['status'], where: { enrollment: { tutoringSessionId: block.id } }, _count: true });
  const cnt2 = Object.fromEntries(att2.map((a) => [a.status, a._count]));
  check('al finalizar: 8 presentes y 2 ausentes', cnt2.PRESENT === 8 && cnt2.ABSENT === 2, JSON.stringify(cnt2));
  const endLogs = await waitLogs(block.id, 'tutoring.completed');
  check('correo de cierre: inasistencias a representantes y DECE', endLogs.some((l) => l.subject.startsWith('Inasistencia')) && endLogs.some((l) => l.audience === 'dece'), `n=${endLogs.length}`);

  // ── 5. Registro por alumno ─────────────────────────────────────────────────────────────
  r = await call(tAdmin, 'GET', `/tutorias/reports/students-registry?levelId=${assignment.levelId}`);
  const row = r.json?.rows?.find((x) => x.studentId === ten[0].id);
  check('registro por alumno: materia y total', r.status === 200 && row && row.counts[assignment.subject.name] >= 1 && row.total >= 1,
    `${r.status} ${JSON.stringify(row?.counts)} total=${row?.total}`);
  check('registro: total general = suma de materias', r.json && r.json.totals.total === Object.values(r.json.totals.bySubject).reduce((a, b) => a + b, 0),
    `${r.json?.totals.total}`);
  r = await call(tAdmin, 'GET', `/tutorias/reports/students-registry?levelId=${assignment.levelId}&count=attended`);
  const absentStudent = ten[8].id;
  const absRow = r.json?.rows?.find((x) => x.studentId === absentStudent);
  check('registro "solo asistidas" no cuenta al ausente', !absRow || (absRow.counts[assignment.subject.name] ?? 0) === 0, JSON.stringify(absRow?.counts));
  r = await call(tAdmin, 'GET', `/tutorias/reports/students-registry.xlsx?levelId=${assignment.levelId}`);
  check('registro en Excel (.xlsx)', r.status === 200 && r.type?.includes('spreadsheetml') && r.size > 3000, `${r.status} ${r.size} bytes`);

  // ── 6. Animador: su curso = paralelo del ALUMNO ────────────────────────────────────────
  const pA = parallels.find((p) => p.id === ten[0].parallelId);
  await call(tAdmin, 'PATCH', `/tutorias/academic/parallels/${pA.id}`, { animatorEmail: 'animador.prueba@uets.edu.ec' });
  const tAnim = await token('animador.prueba@uets.edu.ec');
  // El animador puede tener varios cursos: pide el suyo explícitamente.
  r = await call(tAnim, 'GET', `/tutorias/reports/students-registry?parallelId=${pA.id}`);
  const inA = ten.filter((s) => s.parallelId === pA.id).map((s) => s.id);
  const notMine = await db.parallel.findFirst({
    where: { levelId: assignment.levelId, OR: [{ animatorEmail: null }, { animatorEmail: { not: 'animador.prueba@uets.edu.ec' } }] },
  });
  const rOther = await call(tAnim, 'GET', `/tutorias/reports/students-registry?parallelId=${notMine.id}`);
  check('animador: no puede pedir el registro de otro paralelo', rOther.status === 403, `${rOther.status}`);
  check('animador: registro solo con alumnos de su paralelo', r.status === 200 && r.json.rows.every((x) => x.parallel === pA.name) && inA.every((id) => r.json.rows.some((x) => x.studentId === id)),
    `${r.status} filas=${r.json?.rows?.length}`);

  // ── 7. Cambiar el lugar del horario ────────────────────────────────────────────────────
  const rule = await db.teacherAvailabilityRule.findFirst({ where: { teacherAssignmentId: assignment.id, startTime: hhmm(start) } });
  r = await call(tCarlos, 'PATCH', `/tutorias/availability/rules/${rule.id}`, { location: 'Laboratorio 2 · E2E' });
  const after = await db.tutoringSession.findUnique({ where: { id: block.id } });
  check('cambiar lugar del horario no altera tutorías ya realizadas', r.status === 200 && after.location === 'Aula 9 · Bloque E2E', `${r.status} ${after.location}`);

  console.log(fails ? `\n${fails} FALLA(S)` : '\nTODO OK');
  await db.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
