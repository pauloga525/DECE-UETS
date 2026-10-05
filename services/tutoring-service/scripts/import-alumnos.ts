/**
 * Carga de alumnos reales y sus representantes desde el Excel limpio (Fase 1:
 * Alumnos_limpio.xlsx, hoja "Alumnos"). Pedido 2026-10-02.
 *
 *   npm run import:alumnos -- "C:\ruta\Alumnos_limpio.xlsx"            → simulación (no escribe)
 *   npm run import:alumnos -- "C:\ruta\Alumnos_limpio.xlsx" --apply    → carga real
 *   opcional: --period=<id> (por defecto, el período académico activo)
 *
 * Idempotente: se puede volver a correr con un Excel actualizado.
 *   - Niveles: uno por (nivel educativo, nivel, curso), p. ej. "7.º EGB" o
 *     "2.º Bachillerato Ciencias". Reutiliza los que ya existen con ese nombre.
 *   - Paralelos: por nivel (A, B… o F1, D2…).
 *   - Estudiantes: por número de documento; si cambió de curso, se actualiza.
 *   - Representantes (padre y madre): por cédula; sin cédula, por correo. Hermanos comparten
 *     el mismo representante. Solo reciben correos los que tienen correo.
 */
import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';

const EGB = 'EDUCACIÓN GENERAL BÁSICA';

interface Row {
  doc: string;
  nombre: string;
  apellido1: string;
  apellido2: string | null;
  nivelEducativo: string;
  nivel: string;
  curso: number;
  paralelo: string;
  padre: Parent;
  madre: Parent;
}
interface Parent {
  nombre: string | null;
  apellido1: string | null;
  apellido2: string | null;
  doc: string | null;
  mail: string | null;
}

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = (typeof v === 'object' && 'text' in (v as object) ? (v as { text: string }).text : String(v)).trim();
  return s || null;
};

async function readRows(file: string): Promise<Row[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet('Alumnos');
  if (!ws) throw new Error('El archivo no tiene la hoja "Alumnos" (usa el Excel limpio de la Fase 1)');
  const header = (ws.getRow(1).values as unknown[]).map((h) => text(h));
  // Nombres alternativos aceptados para una misma columna.
  const ALIASES: Record<string, string[]> = { Nivel: ['Nivel', 'Nivel / Especialidad', 'Nivel/Especialidad', 'Especialidad'] };
  const col = (name: string) => {
    const i = header.findIndex((h) => (ALIASES[name] ?? [name]).some((a) => a.toLowerCase() === h?.toLowerCase()));
    if (i < 0) throw new Error(`Falta la columna "${name}"`);
    return i;
  };
  const C = Object.fromEntries(
    [
      'Num documento', 'Nombre', 'Primer Apellido', 'Segundo Apellido', 'Nivel Educativo', 'Nivel', 'Curso', 'Paralelo',
      'Nombre Padre', 'Primer Apellido Padre', 'Segundo Apellido Padre', 'Num documento Padre', 'Mail Padre',
      'Nombre Madre', 'Primer Apellido Madre', 'Segundo Apellido Madre', 'Num documento Madre', 'Mail Madre',
    ].map((n) => [n, col(n)]),
  );
  const rows: Row[] = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const v = (name: string) => text(r.getCell(C[name]).value);
    const doc = v('Num documento');
    if (!doc) return;
    rows.push({
      doc,
      nombre: v('Nombre') ?? '',
      apellido1: v('Primer Apellido') ?? '',
      apellido2: v('Segundo Apellido'),
      nivelEducativo: v('Nivel Educativo') ?? '',
      nivel: v('Nivel') ?? '',
      curso: Number(v('Curso')),
      paralelo: v('Paralelo') ?? '',
      padre: { nombre: v('Nombre Padre'), apellido1: v('Primer Apellido Padre'), apellido2: v('Segundo Apellido Padre'), doc: v('Num documento Padre'), mail: v('Mail Padre')?.toLowerCase() ?? null },
      madre: { nombre: v('Nombre Madre'), apellido1: v('Primer Apellido Madre'), apellido2: v('Segundo Apellido Madre'), doc: v('Num documento Madre'), mail: v('Mail Madre')?.toLowerCase() ?? null },
    });
  });
  return rows;
}

function levelName(r: Row) {
  return r.nivelEducativo === EGB ? `${r.curso}.º EGB` : `${r.curso}.º Bachillerato ${r.nivel}`;
}
// EGB 1–10 primero, luego bachillerato por curso y especialidad.
const levelOrder = (r: Row) => (r.nivelEducativo === EGB ? r.curso : 10 + r.curso);

const joinNames = (...parts: (string | null)[]) => parts.filter(Boolean).join(' ');

async function main() {
  const file = process.argv.find((a, i) => i > 1 && !a.startsWith('--'));
  if (!file) throw new Error('Uso: npm run import:alumnos -- "<ruta>\\Alumnos_limpio.xlsx" [--apply] [--period=<id>]');
  const apply = process.argv.includes('--apply');
  const periodArg = process.argv.find((a) => a.startsWith('--period='))?.split('=')[1];

  const rows = await readRows(file);
  const prisma = new PrismaClient();
  const stats = { levelsNew: 0, levelsReused: 0, parallelsNew: 0, studentsNew: 0, studentsUpdated: 0, guardiansNew: 0, guardiansReused: 0, links: 0, linksWithEmail: 0, parentsSkipped: 0 };

  try {
    const period = periodArg
      ? await prisma.academicPeriod.findUniqueOrThrow({ where: { id: periodArg } })
      : await prisma.academicPeriod.findFirst({ where: { isActive: true } });
    if (!period) throw new Error('No hay un período académico activo (créalo en Configuración → Períodos)');
    console.log(`Período: ${period.name} · ${rows.length} alumnos en el Excel · modo ${apply ? 'CARGA REAL' : 'SIMULACIÓN'}`);

    // ── Niveles y paralelos ────────────────────────────────────────────────────────────
    const levelIds = new Map<string, string>();
    const parallelIds = new Map<string, string>();
    const byLevel = new Map<string, Row>();
    for (const r of rows) if (!byLevel.has(levelName(r))) byLevel.set(levelName(r), r);
    const existingLevels = await prisma.level.findMany({ where: { academicPeriodId: period.id }, include: { parallels: true } });

    for (const [name, r] of byLevel) {
      const found = existingLevels.find((l) => l.name === name);
      let id = found?.id;
      if (found) stats.levelsReused++;
      else stats.levelsNew++;
      if (apply) {
        const level = found
          ? await prisma.level.update({ where: { id: found.id }, data: { order: levelOrder(r), isActive: true } })
          : await prisma.level.create({ data: { name, order: levelOrder(r), academicPeriodId: period.id } });
        id = level.id;
        // Columnas nuevas (migración nivel_subdivision) por SQL: funciona aunque el cliente
        // de Prisma no se haya regenerado todavía.
        await prisma.$executeRaw`UPDATE levels SET "educationLevel" = ${r.nivelEducativo}, stage = ${r.nivel}, grade = ${r.curso} WHERE id = ${id}`;
      }
      levelIds.set(name, id ?? `nuevo:${name}`);
    }
    const pairs = new Set(rows.map((r) => `${levelName(r)}|${r.paralelo}`));
    for (const key of pairs) {
      const [lname, pname] = key.split('|');
      const levelId = levelIds.get(lname) as string;
      const found = existingLevels.find((l) => l.id === levelId)?.parallels.find((p) => p.name === pname);
      if (found) {
        parallelIds.set(key, found.id);
        continue;
      }
      stats.parallelsNew++;
      if (apply) {
        const p = await prisma.parallel.upsert({
          where: { levelId_name: { levelId, name: pname } },
          update: { isActive: true },
          create: { levelId, name: pname },
        });
        parallelIds.set(key, p.id);
      }
    }

    // ── Estudiantes y representantes ───────────────────────────────────────────────────
    const existingStudents = new Map((await prisma.student.findMany({ select: { id: true, identification: true } })).map((s) => [s.identification, s.id]));
    const guardiansByDoc = new Map<string, string>();
    const guardiansByMail = new Map<string, string>();
    for (const g of await prisma.guardian.findMany({ select: { id: true, identification: true, email: true } })) {
      if (g.identification) guardiansByDoc.set(g.identification, g.id);
      if (g.email) guardiansByMail.set(g.email.toLowerCase(), g.id);
    }

    // Vínculos ya cargados (alumno + parentesco → representante): reconoce en una nueva
    // corrida a los representantes sin cédula ni correo, que no tienen otra forma de identificarse.
    const existingLinks = new Map(
      (await prisma.studentGuardian.findMany({ select: { studentId: true, relationship: true, guardianId: true } })).map(
        (l) => [`${l.studentId}|${l.relationship}`, l.guardianId],
      ),
    );

    const resolveGuardian = async (p: Parent, studentId: string | undefined, relationship: string): Promise<string | null> => {
      if (!p.nombre && !p.apellido1 && !p.mail && !p.doc) return null;
      const existing =
        (p.doc && guardiansByDoc.get(p.doc)) ||
        (!p.doc && p.mail && guardiansByMail.get(p.mail)) ||
        (!p.doc && !p.mail && studentId && existingLinks.get(`${studentId}|${relationship}`)) ||
        null;
      const data = {
        firstName: p.nombre ?? '(sin nombre)',
        lastName: joinNames(p.apellido1, p.apellido2) || '(sin apellido)',
        identification: p.doc,
        ...(p.mail ? { email: p.mail } : {}),
      };
      if (existing) {
        stats.guardiansReused++;
        if (apply) await prisma.guardian.update({ where: { id: existing }, data });
        return existing;
      }
      stats.guardiansNew++;
      const id = apply ? (await prisma.guardian.create({ data })).id : `nuevo:${p.doc ?? p.mail ?? Math.random()}`;
      if (p.doc) guardiansByDoc.set(p.doc, id);
      if (p.mail) guardiansByMail.set(p.mail, id);
      return id;
    };

    let done = 0;
    for (const r of rows) {
      const levelId = levelIds.get(levelName(r)) as string;
      const parallelId = parallelIds.get(`${levelName(r)}|${r.paralelo}`) as string;
      const data = {
        firstName: r.nombre,
        lastName: joinNames(r.apellido1, r.apellido2),
        levelId,
        parallelId,
        isActive: true,
      };
      let studentId = existingStudents.get(r.doc);
      if (studentId) stats.studentsUpdated++;
      else stats.studentsNew++;
      if (apply) {
        studentId = studentId
          ? (await prisma.student.update({ where: { id: studentId }, data })).id
          : (await prisma.student.create({ data: { ...data, identification: r.doc } })).id;
      }

      for (const [parent, relationship] of [[r.padre, 'Padre'], [r.madre, 'Madre']] as const) {
        const guardianId = await resolveGuardian(parent, studentId, relationship);
        if (!guardianId) {
          stats.parentsSkipped++;
          continue;
        }
        stats.links++;
        if (parent.mail) stats.linksWithEmail++;
        if (apply && studentId) {
          await prisma.studentGuardian.upsert({
            where: { studentId_guardianId: { studentId, guardianId } },
            update: { relationship, notifications: !!parent.mail },
            create: { studentId, guardianId, relationship, notifications: !!parent.mail },
          });
        }
      }
      if (++done % 500 === 0) console.log(`  … ${done}/${rows.length}`);
    }

    console.log('\nResultado' + (apply ? '' : ' (SIMULACIÓN — no se escribió nada; agrega --apply para cargar)'));
    console.table(stats);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
