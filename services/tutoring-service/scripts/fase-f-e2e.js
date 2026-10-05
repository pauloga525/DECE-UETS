// E2E 2026-10-05: docentes reales con materias por paralelo y animadores.
//   - El docente solo agenda alumnos de los paralelos donde dicta esa materia.
//   - El docente que es animador ve SU curso (alumnos, pendientes, reportes), solo consulta.
//   - Un docente sin curso no accede a la vista de animador ni a reportes.
// Uso (SOLO BD de prueba; crea datos — p. ej. una copia de la base con la carga de docentes):
//   E2E_DATABASE_URL=postgresql://.../dece_docentes?schema=public GATEWAY=http://localhost:4000/api node scripts/fase-f-e2e.js
const { PrismaClient } = require('@prisma/client');
if (!process.env.E2E_DATABASE_URL) throw new Error('Definí E2E_DATABASE_URL (nunca la base con datos reales)');
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
const token = async (email) => (await call(null, 'POST', '/identity/auth/dev-login', { email })).json?.accessToken;
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

(async () => {
  const JIMMY = 'jimmybm@uets.edu.ec';
  const tJimmy = await token(JIMMY);
  check('docente real inicia sesión (dev)', !!tJimmy);
  const jimmy = await db.teacher.findUniqueOrThrow({ where: { email: JIMMY } });

  // ── 1. Animador: su curso ─────────────────────────────────────────────────────────────
  let r = await call(tJimmy, 'GET', '/tutorias/animator/courses');
  const course = r.json?.[0];
  check('docente-animador ve su curso', r.status === 200 && r.json.length === 1 && course.level.name === '10.º EGB' && course.name === 'I',
    `${r.status} ${r.json?.map((c) => c.level.name + ' ' + c.name)}`);
  const inCourse = await db.student.count({ where: { parallelId: course.id, isActive: true } });
  r = await call(tJimmy, 'GET', `/tutorias/animator/students?parallelId=${course.id}`);
  check('ve TODOS los alumnos de su curso (con o sin tutorías)', r.status === 200 && r.json.students.length === inCourse,
    `${r.json?.students?.length}/${inCourse}`);
  r = await call(tJimmy, 'GET', `/tutorias/animator/upcoming?parallelId=${course.id}`);
  check('lista de tutorías pendientes del curso', r.status === 200 && Array.isArray(r.json), `${r.status}`);
  r = await call(tJimmy, 'GET', `/tutorias/reports/summary?parallelId=${course.id}`);
  check('reporte de su curso', r.status === 200, `${r.status}`);
  const other = await db.parallel.findFirstOrThrow({ where: { id: { not: course.id }, animatorEmail: { not: null } } });
  r = await call(tJimmy, 'GET', `/tutorias/reports/summary?parallelId=${other.id}`);
  check('reporte de otro curso: 403', r.status === 403, `${r.status}`);
  r = await call(tJimmy, 'GET', `/tutorias/animator/students?parallelId=${other.id}`);
  check('alumnos de otro curso: 403', r.status === 403, `${r.status}`);

  // ── 2. Docente sin curso ──────────────────────────────────────────────────────────────
  const animators = (await db.parallel.findMany({ where: { animatorEmail: { not: null } }, select: { animatorEmail: true } })).map((p) => p.animatorEmail);
  const plain = await db.teacher.findFirstOrThrow({ where: { email: { notIn: animators }, assignments: { some: {} } } });
  const tPlain = await token(plain.email);
  r = await call(tPlain, 'GET', '/tutorias/animator/courses');
  check('docente sin curso: lista vacía', r.status === 200 && r.json.length === 0, `${plain.email} ${r.status}`);
  r = await call(tPlain, 'GET', '/tutorias/reports/summary');
  check('docente sin curso: reportes 403', r.status === 403, `${r.status}`);

  // ── 3. DECE que también anima un curso ────────────────────────────────────────────────
  const tAnai = await token('anait@uets.edu.ec');
  r = await call(tAnai, 'GET', '/tutorias/animator/courses');
  check('psicóloga-animadora ve su curso', r.status === 200 && r.json.length === 1, `${r.json?.map((c) => c.level.name + ' ' + c.name)}`);

  // ── 4. Mis alumnos (por materia/paralelo) ─────────────────────────────────────────────
  const ef9 = await db.teacherAssignment.findFirstOrThrow({
    where: { teacherId: jimmy.id, level: { name: '9.º EGB' }, subject: { name: 'EDUCACIÓN FÍSICA' } },
    include: { parallels: { include: { parallel: true } } },
  });
  const allowed = ef9.parallels.map((p) => p.parallel.name).sort();
  r = await call(tJimmy, 'GET', `/tutorias/teachers/me/students?assignmentId=${ef9.id}`);
  const seen = [...new Set((r.json ?? []).map((x) => x.parallel.name))].sort();
  check('mis alumnos: solo los paralelos donde dicta la materia', r.status === 200 && JSON.stringify(seen) === JSON.stringify(allowed),
    `vistos=${seen} asignados=${allowed}`);
  r = await call(tJimmy, 'GET', `/tutorias/students?assignmentId=${ef9.id}`);
  const pickerPar = [...new Set((r.json ?? []).map((x) => x.parallel.name))].sort();
  check('selector al crear tutoría: mismos paralelos', r.status === 200 && JSON.stringify(pickerPar) === JSON.stringify(allowed), `${pickerPar}`);

  // ── 5. Agendar: alumno de su paralelo sí, de otro paralelo / de su curso de animador no ──
  const local = new Date(Date.now() - 300 * 60000);
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1));
  const start = 7 * 60 + 20;
  await db.teacherAvailabilityRule.deleteMany({ where: { teacherAssignmentId: ef9.id, location: { contains: 'E2E' } } });
  r = await call(tJimmy, 'POST', '/tutorias/availability/rules', {
    teacherAssignmentId: ef9.id, dayOfWeek: DAYS[day.getUTCDay()], startTime: hhmm(start), endTime: hhmm(start + 40), location: 'Coliseo E2E',
  });
  check('registra su horario', r.status === 201, `${r.status} ${r.json?.message ?? ''}`);
  await call(tJimmy, 'POST', '/tutorias/availability/generate');
  const block = await db.tutoringSession.findFirst({ where: { teacherAssignmentId: ef9.id, date: day, startTime: hhmm(start), status: 'AVAILABLE' } });
  check('bloque generado', !!block);

  const allowedIds = ef9.parallels.map((p) => p.parallelId);
  const okStudent = await db.student.findFirstOrThrow({ where: { parallelId: { in: allowedIds }, isActive: true } });
  const otherParallel = await db.student.findFirstOrThrow({ where: { levelId: ef9.levelId, parallelId: { notIn: allowedIds }, isActive: true } });
  const animatorStudent = await db.student.findFirstOrThrow({ where: { parallelId: course.id, isActive: true } });
  const asInput = (s) => ({ studentId: s.id, reason: 'ACADEMIC_REINFORCEMENT' });

  r = await call(tJimmy, 'POST', `/tutorias/tutoring/sessions/${block.id}/schedule`, { students: [asInput(otherParallel)] });
  check('alumno de un paralelo donde no dicta: rechazado', r.status === 400 && /paralelo/.test(r.json?.message ?? ''), `${r.status} ${r.json?.message}`);
  r = await call(tJimmy, 'POST', `/tutorias/tutoring/sessions/${block.id}/schedule`, { students: [asInput(animatorStudent)] });
  check('alumno de su curso de animador (otra materia): rechazado', r.status === 400, `${r.status} ${r.json?.message}`);
  r = await call(tJimmy, 'POST', `/tutorias/tutoring/sessions/${block.id}/schedule`, { students: [asInput(okStudent)] });
  check('alumno de su paralelo: agendado', r.status === 201 && r.json?.location === 'Coliseo E2E', `${r.status} ${r.json?.message ?? ''}`);

  // El animador del alumno agendado lo ve como pendiente.
  const okParallel = await db.parallel.findUniqueOrThrow({ where: { id: okStudent.parallelId } });
  const tAnim = await token(okParallel.animatorEmail);
  r = await call(tAnim, 'GET', `/tutorias/animator/upcoming?parallelId=${okParallel.id}`);
  check('el animador del alumno ve la tutoría pendiente', r.status === 200 && r.json.some((u) => u.student.id === okStudent.id && u.tutoringSession.id === block.id),
    `${okParallel.animatorEmail} n=${r.json?.length}`);
  r = await call(tAnim, 'GET', `/tutorias/animator/students?parallelId=${okParallel.id}`);
  check('y en el listado aparece con 1 pendiente', r.json?.students?.find((s) => s.id === okStudent.id)?.pending === 1);
  r = await call(tAnim, 'POST', `/tutorias/tutoring/sessions/${block.id}/enrollments`, { students: [asInput(okStudent)] });
  check('el animador no puede agendar en tutorías ajenas', r.status === 403 || r.status === 400, `${r.status}`);

  // ── 6. Asignaciones con paralelos (admin) ─────────────────────────────────────────────
  const tAdmin = await token('pauloga@uets.edu.ec');
  r = await call(tAdmin, 'GET', `/tutorias/teachers/assignments/list?teacherId=${jimmy.id}`);
  check('las asignaciones traen sus paralelos', r.status === 200 && r.json.every((a) => a.parallels.length > 0), `${r.json?.length}`);
  const foreign = await db.parallel.findFirstOrThrow({ where: { levelId: { not: ef9.levelId } } });
  r = await call(tAdmin, 'PATCH', `/tutorias/teachers/assignments/${ef9.id}`, { parallelIds: [foreign.id] });
  check('paralelo de otro nivel en la asignación: rechazado', r.status === 400, `${r.status}`);

  console.log(fails ? `\n${fails} FALLAS` : '\nTodo OK');
  await db.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
