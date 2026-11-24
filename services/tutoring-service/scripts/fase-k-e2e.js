// E2E 2026-11-04: CRUD de "Asignaciones académicas" — crear, agregar paralelos, reasignar a otro
// docente/materia/curso y quitar un paralelo para dárselo a otro docente.
// Uso (SOLO BD de prueba): E2E_DATABASE_URL=postgresql://.../copia?schema=public node scripts/fase-k-e2e.js
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
const login = async (email) => (await call(null, 'POST', '/identity/auth/dev-login', { email })).json?.accessToken;
const names = (a) => (a.parallels ?? []).map((p) => p.parallel.name).sort().join(',');

(async () => {
  const psych = (await db.$queryRaw`SELECT email FROM identity.users WHERE role::text = 'PSYCHOLOGIST' AND "isActive" LIMIT 1`)[0].email;
  const dece = await login(psych);
  const period = await db.academicPeriod.findFirstOrThrow({ where: { isActive: true } });
  // Un curso con 2+ paralelos y una materia que ningún docente tiene en ese curso
  const level = await db.level.findFirstOrThrow({
    where: { isActive: true, parallels: { some: {} } },
    include: { parallels: { orderBy: { name: 'asc' } } },
    orderBy: { order: 'desc' },
  });
  const [p1, p2] = level.parallels;
  const subject = await db.subject.findFirstOrThrow({
    where: { isActive: true, teacherAssignments: { none: { levelId: level.id } } },
  });
  const [t1, t2] = await db.teacher.findMany({ where: { isActive: true }, take: 2, orderBy: { lastName: 'asc' } });
  console.log(`curso ${level.name} (${p1.name}, ${p2?.name}) · materia ${subject.name}`);

  // 1) Crear (DECE) una asignación nueva
  let r = await call(dece, 'POST', '/tutorias/teachers/assignments', {
    teacherId: t1.id, subjectId: subject.id, levelId: level.id, academicPeriodId: period.id, parallelIds: [p1.id],
  });
  check('DECE crea una asignación nueva (materia/curso sin docente)', r.status === 201 && names(r.json) === p1.name, `${r.status} ${r.json?.message ?? ''}`);
  const A = r.json;
  r = await call(dece, 'POST', '/tutorias/teachers/assignments', {
    teacherId: t1.id, subjectId: subject.id, levelId: level.id, academicPeriodId: period.id,
  });
  check('la misma combinación docente+materia+curso: 409', r.status === 409, `${r.status}`);

  // 2) Agregar un paralelo
  r = await call(dece, 'PATCH', `/tutorias/teachers/assignments/${A.id}`, { parallelIds: [p1.id, p2.id] });
  check('agregar un paralelo a la asignación', r.status === 200 && names(r.json) === [p1.name, p2.name].sort().join(','), names(r.json ?? {}));

  // 3) Quitar el paralelo p2 y dárselo a otro docente
  r = await call(dece, 'PATCH', `/tutorias/teachers/assignments/${A.id}`, { parallelIds: [p1.id] });
  check('quitar un paralelo al docente', r.status === 200 && names(r.json) === p1.name, names(r.json ?? {}));
  r = await call(dece, 'POST', '/tutorias/teachers/assignments', {
    teacherId: t2.id, subjectId: subject.id, levelId: level.id, academicPeriodId: period.id, parallelIds: [p2.id],
  });
  check('asignar ese paralelo a otro docente', r.status === 201, `${r.status}`);
  const B = r.json;

  // 4) Reasignar la asignación de t1 a otro curso (sin historial): se borran horarios, paralelos nuevos
  const tok1 = await login(t1.email);
  r = await call(tok1, 'POST', '/tutorias/availability/rules', {
    teacherAssignmentId: A.id, dayOfWeek: 'SATURDAY', startTime: '07:00', endTime: '07:40', location: 'E2E',
  });
  check('el docente declara un horario en la asignación', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  await call(dece, 'POST', '/tutorias/availability/generate');
  const other = await db.level.findFirstOrThrow({
    where: { id: { not: level.id }, isActive: true, parallels: { some: {} } },
    include: { parallels: { orderBy: { name: 'asc' } } },
  });
  r = await call(dece, 'PATCH', `/tutorias/teachers/assignments/${A.id}`, { levelId: other.id, parallelIds: [other.parallels[0].id] });
  check('cambiar la asignación a otro curso', r.status === 200 && r.json.levelId === other.id && names(r.json) === other.parallels[0].name,
    `${r.status} ${r.json?.message ?? ''}`);
  check('sus horarios y bloques libres se borraron',
    (await db.teacherAvailabilityRule.count({ where: { teacherAssignmentId: A.id } })) === 0 &&
      (await db.tutoringSession.count({ where: { teacherAssignmentId: A.id } })) === 0);
  r = await call(dece, 'PATCH', `/tutorias/teachers/assignments/${A.id}`, { levelId: level.id, parallelIds: [p1.id] });
  check('volver a su curso original', r.status === 200 && r.json.levelId === level.id, `${r.status}`);
  r = await call(dece, 'PATCH', `/tutorias/teachers/assignments/${A.id}`, { parallelIds: [other.parallels[0].id] });
  check('paralelo que no es del curso de la asignación: 400', r.status === 400, `${r.status}`);

  // 5) Reasignar a otro docente: si choca con una asignación existente, 409 claro
  r = await call(dece, 'PATCH', `/tutorias/teachers/assignments/${A.id}`, { teacherId: t2.id });
  check('reasignar a un docente que ya tiene esa materia y curso: 409', r.status === 409, `${r.status} ${r.json?.message}`);
  r = await call(dece, 'DELETE', `/tutorias/teachers/assignments/${B.id}`);
  r = await call(dece, 'PATCH', `/tutorias/teachers/assignments/${A.id}`, { teacherId: t2.id });
  check('reasignar la asignación a otro docente', r.status === 200 && r.json.teacherId === t2.id, `${r.status}`);

  // 6) Con historial no se reasigna
  const used = await db.teacherAssignment.findFirstOrThrow({
    where: { tutoringSessions: { some: { status: { not: 'AVAILABLE' } } } },
  });
  r = await call(dece, 'PATCH', `/tutorias/teachers/assignments/${used.id}`, { teacherId: t1.id === used.teacherId ? t2.id : t1.id });
  check('asignación con tutorías registradas: no se reasigna (409)', r.status === 409, `${r.status} ${r.json?.message}`);
  const lvl = await db.level.findUniqueOrThrow({ where: { id: used.levelId }, include: { parallels: true } });
  r = await call(dece, 'PATCH', `/tutorias/teachers/assignments/${used.id}`, { parallelIds: lvl.parallels.slice(0, 1).map((p) => p.id) });
  check('pero sí se le pueden cambiar los paralelos', r.status === 200, `${r.status}`);

  // 7) El docente no gestiona asignaciones
  r = await call(tok1, 'POST', '/tutorias/teachers/assignments', {
    teacherId: t1.id, subjectId: subject.id, levelId: other.id, academicPeriodId: period.id,
  });
  check('un docente no puede crear asignaciones', r.status === 403, `${r.status}`);

  console.log(fails ? `\n${fails} FALLAS` : '\nTodo OK');
  await db.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
