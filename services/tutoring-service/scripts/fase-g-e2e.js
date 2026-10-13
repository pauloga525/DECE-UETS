// E2E 2026-10-13: la misma materia en varias especialidades del mismo curso comparte horario y
// tutoría (p. ej. Química de 3.º Bach. IEME, Mecanizado, Mecatrónica…).
// Uso (SOLO BD de prueba, una copia de la base con docentes reales):
//   E2E_DATABASE_URL=postgresql://.../copia?schema=public TEACHER=fabiolaah@uets.edu.ec SUBJECT=QUÍMICA GRADE=3 node scripts/fase-g-e2e.js
const { PrismaClient } = require('@prisma/client');
if (!process.env.E2E_DATABASE_URL) throw new Error('Definí E2E_DATABASE_URL (nunca la base con datos reales)');
if (/tutorias_dev/.test(process.env.E2E_DATABASE_URL)) throw new Error('No uses tutorias_dev: usa una copia');
const db = new PrismaClient({ datasourceUrl: process.env.E2E_DATABASE_URL });
const GW = process.env.GATEWAY ?? 'http://localhost:4000/api';
const EMAIL = process.env.TEACHER ?? 'fabiolaah@uets.edu.ec';
const SUBJECT = process.env.SUBJECT ?? 'QUÍMICA';
const GRADE = Number(process.env.GRADE ?? 3);

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
const token = async (email) => (await call(null, 'POST', '/identity/auth/dev-login', { email })).json?.accessToken;

(async () => {
  const tok = await token(EMAIL);
  const teacher = await db.teacher.findUniqueOrThrow({ where: { email: EMAIL } });
  const sibs = await db.teacherAssignment.findMany({
    where: { teacherId: teacher.id, subject: { name: SUBJECT }, level: { grade: GRADE, educationLevel: 'BACHILLERATO' } },
    include: { level: true, parallels: { include: { parallel: true } } },
    orderBy: { level: { name: 'asc' } },
  });
  check(`el docente dicta ${SUBJECT} en varias especialidades de ${GRADE}.º`, sibs.length >= 2, sibs.map((s) => s.level.stage).join(' | '));
  const [a, b] = sibs;
  const other = await db.teacherAssignment.findFirst({ where: { teacherId: teacher.id, NOT: { subject: { name: SUBJECT } } } });

  // Limpia horarios de prueba previos
  await db.tutoringSession.deleteMany({ where: { teacherId: teacher.id, status: 'AVAILABLE', availabilityRule: { location: { contains: 'E2E' } } } });
  await db.teacherAvailabilityRule.deleteMany({ where: { teacherAssignment: { teacherId: teacher.id }, location: { contains: 'E2E' } } });

  const rule = (assignmentId, startTime, endTime) =>
    call(tok, 'POST', '/tutorias/availability/rules', { teacherAssignmentId: assignmentId, dayOfWeek: 'SATURDAY', startTime, endTime, location: 'Laboratorio E2E' });

  let r = await rule(a.id, '09:00', '09:40');
  check('horario en la 1.ª especialidad', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  r = await rule(b.id, '09:00', '09:40');
  check('mismo horario en otra especialidad del mismo curso: permitido', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  r = await rule(b.id, '08:40', '09:40');
  check('cruce desalineado (08:40–09:40 contra 09:00): rechazado', r.status === 400, `${r.status}`);
  if (other) {
    r = await rule(other.id, '09:00', '09:40');
    check('otra materia a la misma hora: rechazado', r.status === 400, `${r.status}`);
  }

  await call(tok, 'POST', '/tutorias/availability/generate');
  const blocks = await db.tutoringSession.findMany({ where: { teacherId: teacher.id, startTime: '09:00', status: 'AVAILABLE', location: 'Laboratorio E2E' }, orderBy: { date: 'asc' } });
  const byDate = new Map();
  blocks.forEach((s) => byDate.set(s.date.toISOString(), (byDate.get(s.date.toISOString()) ?? 0) + 1));
  check('un solo bloque por fecha (no se duplica)', blocks.length > 0 && [...byDate.values()].every((n) => n === 1), `${blocks.length} bloques`);
  const block = blocks[0];

  r = await call(tok, 'GET', `/tutorias/students?assignmentId=${block.teacherAssignmentId}`);
  const levels = new Set((r.json ?? []).map((s) => s.levelId));
  check('el selector ofrece alumnos de todas sus especialidades del curso', levels.size === sibs.length, `${levels.size} especialidades, ${r.json?.length} alumnos`);

  const studentOf = async (asg) =>
    db.student.findFirstOrThrow({
      where: { levelId: asg.levelId, isActive: true, ...(asg.parallels.length ? { parallelId: { in: asg.parallels.map((p) => p.parallelId) } } : {}) },
    });
  const sa = await studentOf(a);
  const sb = await studentOf(b);
  const notTaught = await db.student.findFirst({
    where: { isActive: true, level: { grade: GRADE, educationLevel: 'BACHILLERATO', id: { notIn: sibs.map((s) => s.levelId) } } },
  });
  const asInput = (s) => ({ studentId: s.id, reason: 'ACADEMIC_REINFORCEMENT' });
  if (notTaught) {
    r = await call(tok, 'POST', `/tutorias/tutoring/sessions/${block.id}/schedule`, { students: [asInput(notTaught)] });
    check('alumno de una especialidad donde no dicta la materia: rechazado', r.status === 400, `${r.status} ${r.json?.message}`);
  }
  r = await call(tok, 'POST', `/tutorias/tutoring/sessions/${block.id}/schedule`, { students: [asInput(sa), asInput(sb)] });
  check('una tutoría con alumnos de dos especialidades', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  const det = await call(tok, 'GET', `/tutorias/tutoring/sessions/${block.id}`);
  check('el detalle trae la especialidad de cada alumno', det.json?.enrollments?.every((e) => e.student?.level?.name), det.json?.enrollments?.map((e) => e.student.level.stage).join(' | '));

  console.log(fails ? `\n${fails} FALLAS` : '\nTodo OK');
  await db.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
