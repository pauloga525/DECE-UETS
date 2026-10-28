// E2E 2026-10-27: el DECE (coordinador y psicólogos) también edita/quita materias de un docente y
// elimina horarios; el docente sigue sin poder tocar materias.
// Uso (SOLO BD de prueba): E2E_DATABASE_URL=postgresql://.../copia?schema=public node scripts/fase-j-e2e.js
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

(async () => {
  const roles = await db.$queryRaw`SELECT email, role::text AS role FROM identity.users WHERE role::text IN ('PSYCHOLOGIST','PSYCHOLOGY_COORDINATOR') AND "isActive" ORDER BY role LIMIT 2`;
  const TECH = 'mayrapp@uets.edu.ec';
  const teacherTok = await login(TECH);
  const teacher = await db.teacher.findUniqueOrThrow({ where: { email: TECH } });
  const free = await db.teacherAssignment.findMany({
    where: { teacherId: teacher.id, tutoringSessions: { none: {} } },
  });
  for (const [i, u] of roles.entries()) {
    const tok = await login(u.email);
    const a = free[i];
    let r = await call(tok, 'PATCH', `/tutorias/teachers/assignments/${a.id}`, { isActive: false });
    check(`${u.role}: desactiva una materia`, r.status === 200, `${r.status}`);
    const rule = await call(teacherTok, 'POST', '/tutorias/availability/rules', {
      teacherAssignmentId: free[2 + i].id, dayOfWeek: 'SATURDAY', startTime: '07:00', endTime: '07:40', location: 'E2E',
    });
    r = await call(tok, 'DELETE', `/tutorias/availability/rules/${rule.json?.id}`);
    check(`${u.role}: elimina un horario del docente`, r.status === 200, `${rule.status}/${r.status}`);
    r = await call(tok, 'DELETE', `/tutorias/teachers/assignments/${a.id}`);
    check(`${u.role}: quita una materia sin historial`, r.status === 200, `${r.status} ${r.json?.message ?? ''}`);
  }
  const own = await call(teacherTok, 'DELETE', `/tutorias/teachers/assignments/${free[4].id}`);
  check('el docente sigue sin poder quitar materias', own.status === 403, `${own.status}`);

  console.log(fails ? `\n${fails} FALLAS` : '\nTodo OK');
  await db.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
