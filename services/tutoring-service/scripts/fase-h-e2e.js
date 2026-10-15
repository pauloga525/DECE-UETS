// E2E 2026-10-15: el administrador cambia el correo de un docente.
// Uso (SOLO BD de prueba, copia de la base con docentes reales):
//   E2E_DATABASE_URL=postgresql://.../copia?schema=public node scripts/fase-h-e2e.js
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
const login = (email) => call(null, 'POST', '/identity/auth/dev-login', { email });

(async () => {
  const OLD = 'jimmybm@uets.edu.ec';
  const NEW = 'jimmy.bravo@uets.edu.ec';
  const admin = (await login('pauloga@uets.edu.ec')).json.accessToken;
  const t = await db.teacher.findUniqueOrThrow({ where: { email: OLD } });
  const oldUser = (await db.$queryRaw`SELECT id FROM identity.users WHERE email = ${OLD}`)[0];
  const animated = await db.parallel.count({ where: { animatorEmail: OLD } });

  // Rechazos (no deben cambiar nada)
  let r = await call(admin, 'PATCH', `/tutorias/teachers/${t.id}`, { email: 'jimmy@gmail.com' });
  check('correo de otro dominio: rechazado', r.status === 400, `${r.status} ${r.json?.message}`);
  r = await call(admin, 'PATCH', `/tutorias/teachers/${t.id}`, { email: 'jimmy.est@uets.edu.ec' });
  check('cuenta de estudiante (.est): rechazada', r.status === 400, `${r.status} ${r.json?.message}`);
  const other = await db.teacher.findFirstOrThrow({ where: { email: { not: OLD } } });
  r = await call(admin, 'PATCH', `/tutorias/teachers/${t.id}`, { email: other.email });
  check('correo de otro docente: 409', r.status === 409, `${r.status} ${r.json?.message}`);
  check('tras los rechazos el correo no cambió', (await db.teacher.findUnique({ where: { id: t.id } })).email === OLD);
  const tTeacher = (await login(OLD)).json.accessToken;
  r = await call(tTeacher, 'PATCH', `/tutorias/teachers/${t.id}`, { email: NEW });
  check('un docente no puede editarse el correo: 403', r.status === 403, `${r.status}`);

  // Cambio válido
  r = await call(admin, 'PATCH', `/tutorias/teachers/${t.id}`, { email: NEW, firstName: t.firstName, lastName: t.lastName });
  check('el admin cambia el correo', r.status === 200 && r.json?.email === NEW, `${r.status} ${r.json?.message ?? ''}`);
  const after = await db.teacher.findUnique({ where: { id: t.id } });
  check('la ficha se desvincula de la cuenta anterior', after.userId === null);
  check('los cursos que anima pasan al correo nuevo', (await db.parallel.count({ where: { animatorEmail: NEW } })) === animated && animated > 0, `${animated} curso(s)`);
  const renamed = (await db.$queryRaw`SELECT id, email, role::text AS role, "googleSub" FROM identity.users WHERE id = ${oldUser.id}`)[0];
  check('la cuenta de acceso se renombró (mismo usuario y rol)', renamed.email === NEW && renamed.role === 'TEACHER' && renamed.googleSub === null, JSON.stringify(renamed));
  // Las sesiones se validan con una caché de 30 s (igual que al cambiar un rol): pasado ese plazo
  // el token anterior queda rechazado.
  await new Promise((res) => setTimeout(res, 31_000));
  r = await call(tTeacher, 'GET', '/tutorias/teachers/me');
  check('la sesión anterior quedó cerrada (tras la caché de 30 s)', r.status === 401, `${r.status}`);
  r = await login(OLD);
  check('el correo anterior ya no puede entrar', r.status >= 400, `${r.status}`);
  const lNew = await login(NEW);
  check('entra con el correo nuevo', lNew.status === 201 || lNew.status === 200, `${lNew.status}`);
  r = await call(lNew.json.accessToken, 'GET', '/tutorias/teachers/me');
  check('con el correo nuevo ve su ficha, asignaciones y su curso de animador',
    r.status === 200 && r.json?.assignments?.length > 0, `${r.status} asignaciones=${r.json?.assignments?.length}`);
  r = await call(lNew.json.accessToken, 'GET', '/tutorias/animator/courses');
  check('sigue siendo animador de su curso', r.status === 200 && r.json.length === animated);

  console.log(fails ? `\n${fails} FALLAS` : '\nTodo OK');
  await db.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
