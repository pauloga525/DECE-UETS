// E2E 2026-10-23: materias técnicas con horarios cruzados, eliminar horarios y editar las
// materias de un docente desde el administrador.
// Uso (SOLO BD de prueba, copia de la base con docentes reales):
//   E2E_DATABASE_URL=postgresql://.../copia?schema=public node scripts/fase-i-e2e.js
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
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
const login = async (email) => (await call(null, 'POST', '/identity/auth/dev-login', { email })).json.accessToken;
const rule = (tok, a, startTime, endTime, day = 'SATURDAY') =>
  call(tok, 'POST', '/tutorias/availability/rules', {
    teacherAssignmentId: a.id, dayOfWeek: day, startTime, endTime, location: 'Taller E2E',
  });
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

(async () => {
  const TECH = 'mayrapp@uets.edu.ec';
  const admin = await login('pauloga@uets.edu.ec');
  const tok = await login(TECH);
  const teacher = await db.teacher.findUniqueOrThrow({ where: { email: TECH } });
  const assignments = await db.teacherAssignment.findMany({
    where: { teacherId: teacher.id, isActive: true },
    include: { subject: true, level: true },
  });
  const tech = assignments.filter((a) => a.subject.isTechnical);
  const core = assignments.filter((a) => !a.subject.isTechnical);
  // Dos técnicas de distinta materia y distinto nivel
  const t1 = tech[0];
  const t2 = tech.find((a) => a.subjectId !== t1.subjectId && a.levelId !== t1.levelId);
  const t3 = tech.find((a) => a !== t1 && a !== t2 && a.subjectId !== t1.subjectId && a.subjectId !== t2.subjectId);
  const [c1, c2] = core;
  console.log(`técnicas: ${t1.subject.name} · ${t1.level.name} | ${t2.subject.name} · ${t2.level.name} | ${t3.subject.name}`);
  console.log(`tronco común: ${c1.subject.name} | ${c2?.subject.name}`);

  // 1) Cruces de horario
  let r = await rule(tok, t1, '08:00', '09:20');
  check('técnica 1: horario sábado 08:00–09:20', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  const ruleA = r.json;
  r = await rule(tok, t2, '08:00', '09:20');
  check('técnica 2 (otra materia y nivel) a la MISMA hora: permitido', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  const ruleB = r.json;
  r = await rule(tok, t3, '08:20', '09:00');
  check('técnica 3 cruzada y desalineada: permitido', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  r = await rule(tok, c1, '08:40', '09:20');
  check('tronco común cruzado con técnicas: rechazado', r.status === 400, `${r.status} ${r.json?.message}`);
  r = await rule(tok, c1, '10:00', '10:40');
  check('tronco común en hora libre: permitido', r.status === 201, `${r.status}`);
  const ruleC1 = r.json;
  if (c2) {
    r = await rule(tok, c2, '10:00', '10:40');
    check('dos de tronco común a la misma hora: rechazado', r.status === 400, `${r.status}`);
  }
  r = await rule(tok, t1, '10:00', '10:40');
  check('técnica cruzada con tronco común: rechazada', r.status === 400, `${r.status}`);

  // 2) Bloques: uno por materia a la misma hora
  r = await call(tok, 'POST', '/tutorias/availability/generate');
  check('generar bloques', r.status === 201 || r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);
  const first = await db.tutoringSession.findFirst({
    where: { availabilityRuleId: ruleA.id, startTime: '08:00' }, orderBy: { date: 'asc' },
  });
  const same = await db.tutoringSession.findMany({
    where: { teacherId: teacher.id, date: first.date, startTime: '08:00' },
  });
  check('mismo sábado 08:00: un bloque por cada materia técnica', same.length === 2 && new Set(same.map((s) => s.subjectId)).size === 2,
    `${same.length} bloques`);

  // 3) Iniciar a la vez dos tutorías simultáneas
  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const base = (a, slotKey) => ({
    teacherId: teacher.id, subjectId: a.subjectId, levelId: a.levelId, teacherAssignmentId: a.id,
    academicPeriodId: a.academicPeriodId, date: today, startTime: hhmm(nowMin - 5), endTime: hhmm(nowMin + 35),
    status: 'SCHEDULED', location: 'Taller E2E', slotKey,
  });
  const S1 = await db.tutoringSession.create({ data: base(t1, 'e2e-1') });
  const S2 = await db.tutoringSession.create({ data: base(t2, 'e2e-2') });
  r = await call(tok, 'POST', `/tutorias/tutoring/sessions/${S1.id}/start`, {});
  check('iniciar tutoría técnica 1', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  r = await call(tok, 'POST', `/tutorias/tutoring/sessions/${S2.id}/start`, {});
  check('iniciar a la vez la técnica 2 (simultánea)', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  // S1 pasa a un horario anterior que no se cruza con S3 → S3 no puede iniciarse con S1 en curso.
  const S3 = await db.tutoringSession.create({
    data: { ...base(c1, 'e2e-3'), startTime: hhmm(nowMin - 3), endTime: hhmm(nowMin + 2) },
  });
  await db.tutoringSession.update({ where: { id: S1.id }, data: { startTime: hhmm(nowMin - 40), endTime: hhmm(nowMin - 4) } });
  r = await call(tok, 'POST', `/tutorias/tutoring/sessions/${S3.id}/start`, {});
  check('con otra en curso en otro horario: sigue bloqueado', r.status === 409, `${r.status} ${r.json?.message ?? ''}`);

  // 4) Eliminar horarios
  const other = await db.teacherAvailabilityRule.findFirst({ where: { teacherAssignment: { teacherId: { not: teacher.id } } } });
  if (other) {
    r = await call(tok, 'DELETE', `/tutorias/availability/rules/${other.id}`);
    check('no puede eliminar el horario de otro docente', r.status === 403, `${r.status}`);
  }
  const nextB = await db.tutoringSession.findFirst({
    where: { availabilityRuleId: ruleB.id, status: 'AVAILABLE' }, orderBy: { date: 'asc' },
  });
  await db.tutoringSession.update({ where: { id: nextB.id }, data: { status: 'SCHEDULED' } });
  r = await call(tok, 'DELETE', `/tutorias/availability/rules/${ruleB.id}`);
  check('horario con tutoría agendada: no se elimina (409)', r.status === 409, `${r.status} ${r.json?.message}`);
  const blocksA = await db.tutoringSession.count({ where: { availabilityRuleId: ruleA.id } });
  r = await call(tok, 'DELETE', `/tutorias/availability/rules/${ruleA.id}`);
  check('el docente elimina su horario', r.status === 200 && r.json?.freedBlocks === blocksA, `${r.status} ${JSON.stringify(r.json)}`);
  check('el horario y sus bloques libres ya no existen',
    !(await db.teacherAvailabilityRule.findUnique({ where: { id: ruleA.id } })) &&
      (await db.tutoringSession.count({ where: { availabilityRuleId: ruleA.id } })) === 0);

  // 5) Reactivar un horario revalida los cruces
  await call(tok, 'PATCH', `/tutorias/availability/rules/${ruleC1.id}`, { isActive: false });
  r = await rule(tok, t1, '10:00', '10:40');
  check('con el de tronco común inactivo, una técnica toma ese horario', r.status === 201, `${r.status}`);
  r = await call(tok, 'PATCH', `/tutorias/availability/rules/${ruleC1.id}`, { isActive: true });
  check('reactivar el de tronco común cruzado: rechazado', r.status === 400, `${r.status} ${r.json?.message}`);

  // 6) Materias del docente desde el administrador
  const lvl = await db.level.findUniqueOrThrow({ where: { id: t3.levelId }, include: { parallels: true } });
  const pIds = lvl.parallels.slice(0, 1).map((p) => p.id);
  r = await call(admin, 'PATCH', `/tutorias/teachers/assignments/${t3.id}`, { parallelIds: pIds });
  check('admin cambia los paralelos de una materia', r.status === 200 && r.json.parallels.length === pIds.length, `${r.status}`);
  r = await call(admin, 'PATCH', `/tutorias/teachers/assignments/${t3.id}`, { isActive: false });
  check('admin desactiva una materia', r.status === 200 && r.json.isActive === false);
  await call(admin, 'PATCH', `/tutorias/teachers/assignments/${t3.id}`, { isActive: true });
  r = await call(tok, 'DELETE', `/tutorias/teachers/assignments/${t3.id}`);
  check('un docente no puede quitarse materias', r.status === 403, `${r.status}`);
  r = await call(admin, 'DELETE', `/tutorias/teachers/assignments/${t2.id}`);
  check('materia con tutorías registradas: no se quita (409)', r.status === 409, `${r.status} ${r.json?.message}`);
  r = await call(admin, 'DELETE', `/tutorias/teachers/assignments/${t3.id}`);
  check('admin quita una materia sin historial (con su horario)', r.status === 200, `${r.status} ${r.json?.message ?? ''}`);
  check('la materia y su horario ya no existen',
    !(await db.teacherAssignment.findUnique({ where: { id: t3.id } })) &&
      (await db.teacherAvailabilityRule.count({ where: { teacherAssignmentId: t3.id } })) === 0);
  r = await call(admin, 'POST', '/tutorias/teachers/assignments', {
    teacherId: teacher.id, subjectId: t3.subjectId, levelId: t3.levelId, academicPeriodId: t3.academicPeriodId,
  });
  check('admin vuelve a asignarla', r.status === 201, `${r.status}`);

  // 7) Marcar materia técnica
  r = await call(admin, 'PATCH', `/tutorias/academic/subjects/${c1.subjectId}`, { isTechnical: true });
  check('admin marca una materia como técnica', r.status === 200 && r.json.isTechnical === true);
  r = await call(tok, 'PATCH', `/tutorias/academic/subjects/${c1.subjectId}`, { isTechnical: false });
  check('un docente no puede cambiarlo', r.status === 403, `${r.status}`);

  console.log(fails ? `\n${fails} FALLAS` : '\nTodo OK');
  await db.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
