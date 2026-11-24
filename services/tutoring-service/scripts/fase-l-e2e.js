// E2E 2026-11-24: reporte de tutorías no realizadas o no completadas.
// Uso (SOLO BD de prueba): E2E_DATABASE_URL=postgresql://.../copia?schema=public node scripts/fase-l-e2e.js
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
async function call(tok, p) {
  const r = await fetch(`${GW}${p}`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
  const type = r.headers.get('content-type') ?? '';
  const body = type.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, body, type };
}
const login = async (email) =>
  (await (await fetch(`${GW}/identity/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
  })).json()).accessToken;

(async () => {
  const admin = await login('pauloga@uets.edu.ec');
  const before = (await call(admin, '/tutorias/reports/unfulfilled')).body;
  check('el reporte responde', before.total >= 0, `total=${before.total}`);

  // Dos tutorías pasadas sobre bloques reales: una iniciada y cerrada por el sistema (sin informe),
  // otra cancelada con motivo. Cada una con un alumno del nivel.
  const blocks = await db.tutoringSession.findMany({
    where: { status: 'AVAILABLE' }, include: { teacher: true }, take: 2, orderBy: { date: 'asc' },
  });
  const past = new Date('2026-11-02');
  const student = await db.student.findFirstOrThrow({ where: { levelId: blocks[0].levelId, isActive: true }, include: { parallel: true } });
  const student2 = await db.student.findFirstOrThrow({ where: { levelId: blocks[1].levelId, isActive: true } });
  const creator = (await db.user.findFirst({ where: { role: 'ADMIN' } })).id;
  await db.tutoringSession.update({
    where: { id: blocks[0].id },
    data: { date: past, status: 'COMPLETED', startedAt: past, completedAt: past, autoCompleted: true, slotKey: 'e2e-l-1',
      enrollments: { create: { studentId: student.id, reason: 'ACADEMIC_REINFORCEMENT', createdById: creator, status: 'ABSENT' } } },
  });
  await db.tutoringSession.update({
    where: { id: blocks[1].id },
    data: { date: past, status: 'CANCELLED', cancelReason: 'Docente con permiso médico', cancelledById: creator, cancelledAt: past, slotKey: 'e2e-l-2',
      enrollments: { create: { studentId: student2.id, reason: 'ACADEMIC_REINFORCEMENT', createdById: creator, status: 'CANCELLED' } } },
  });

  let r = await call(admin, '/tutorias/reports/unfulfilled');
  const d = r.body;
  check('suma la no finalizada y la cancelada', d.total === before.total + 2 && d.totals.NOT_CLOSED === before.totals.NOT_CLOSED + 1 && d.totals.CANCELLED === before.totals.CANCELLED + 1,
    JSON.stringify(d.totals));
  const nc = d.rows.find((x) => x.id === blocks[0].id);
  check('no finalizada: informe pendiente, curso y paralelo del alumno', nc?.kind === 'NOT_CLOSED' && nc.reportPending && nc.students === 1 && nc.parallels[0] === student.parallel.name,
    JSON.stringify(nc && { kind: nc.kind, rp: nc.reportPending, par: nc.parallels }));
  const cc = d.rows.find((x) => x.id === blocks[1].id);
  check('cancelada: motivo y quién la canceló', cc?.kind === 'CANCELLED' && cc.cancelReason === 'Docente con permiso médico' && !!cc.cancelledBy);
  check('las no realizadas de la base aparecen como NOT_HELD', d.totals.NOT_HELD === before.totals.NOT_HELD && d.rows.filter((x) => x.kind === 'NOT_HELD').every((x) => x.reportPending === false));
  check('por docente suma lo mismo que el total', d.byTeacher.reduce((a, t) => a + t.total, 0) === d.total);

  r = await call(admin, '/tutorias/reports/unfulfilled?kind=CANCELLED');
  check('filtro por estado (solo canceladas)', r.body.rows.every((x) => x.kind === 'CANCELLED') && r.body.total === d.totals.CANCELLED);
  r = await call(admin, `/tutorias/reports/unfulfilled?teacherId=${blocks[0].teacherId}&from=2026-11-01&to=2026-11-03`);
  check('filtro por docente y fechas', r.body.rows.some((x) => x.id === blocks[0].id) && r.body.rows.every((x) => x.date >= '2026-11-01' && x.date <= '2026-11-03'),
    `${r.body.total}`);
  r = await call(admin, '/tutorias/reports/unfulfilled?kind=OTRO');
  check('estado inválido: 400', r.status === 400, `${r.status}`);

  r = await call(admin, '/tutorias/reports/unfulfilled.xlsx');
  check('Excel', r.status === 200 && r.body.subarray(0, 2).toString() === 'PK', `${r.status} ${r.body.length} bytes`);
  r = await call(admin, '/tutorias/reports/unfulfilled.pdf');
  check('PDF', r.status === 200 && r.body.subarray(0, 4).toString() === '%PDF', `${r.status} ${r.body.length} bytes`);
  require('fs').writeFileSync(process.env.PDF_OUT ?? 'tutorias-no-realizadas.pdf', r.body);

  // Docente animador: solo su curso
  const parallel = await db.parallel.findFirstOrThrow({ where: { animatorEmail: { not: null } } });
  const anim = await login(parallel.animatorEmail);
  r = await call(anim, '/tutorias/reports/unfulfilled');
  const inCourse = await db.student.count({ where: { parallelId: parallel.id } });
  check('el animador solo ve su curso', r.status === 200 && r.body.rows.every((x) => x.parallels.length <= 1), `${r.status} total=${r.body.total} (curso con ${inCourse} alumnos)`);
  const plain = await db.teacher.findFirstOrThrow({ where: { isActive: true, email: { notIn: (await db.parallel.findMany({ where: { animatorEmail: { not: null } }, select: { animatorEmail: true } })).map((p) => p.animatorEmail) } } });
  r = await call(await login(plain.email), '/tutorias/reports/unfulfilled');
  check('un docente que no es animador: 403', r.status === 403, `${r.status}`);

  console.log(fails ? `\n${fails} FALLAS` : '\nTodo OK');
  await db.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
