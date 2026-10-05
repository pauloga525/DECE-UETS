/**
 * Carga de docentes reales, sus materias por paralelo y los animadores de curso desde el
 * Excel limpio (Docentes_limpio.xlsx). Pedido 2026-10-05.
 *
 *   npm run import:docentes -- "C:\ruta\Docentes_limpio.xlsx"            → simulación (no escribe)
 *   npm run import:docentes -- "C:\ruta\Docentes_limpio.xlsx" --apply    → carga real
 *   opcional: --period=<id> (por defecto, el período académico activo)
 *
 * Idempotente: se puede volver a correr con un Excel actualizado.
 *   - Hoja "Docentes_Materias": una fila por nivel + paralelo + materia + docente.
 *       · Docente: por correo (ficha en tutorías + usuario con rol TEACHER en identidad; a un
 *         usuario que ya existe NO se le cambia el rol, p. ej. un admin que también dicta clases).
 *       · Materia: por nombre (sin distinguir mayúsculas ni espacios dobles).
 *       · Asignación docente + materia + nivel, con los paralelos donde la dicta (se reemplazan
 *         por los del Excel).
 *   - Hoja "Animadores_PDF": el animador (dirigente) de cada paralelo → Parallel.animatorEmail.
 *     Los animadores que no dictan materias en el Excel igual se crean como docentes.
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
// jszip viene con exceljs. Se usa para quitar las "tablas" de Excel antes de leer: exceljs
// falla con algunas (p. ej. las que genera openpyxl) y aquí no hacen falta.
import JSZip = require('jszip');

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = (typeof v === 'object' && 'text' in (v as object) ? (v as { text: string }).text : String(v)).trim();
  return s ? s.replace(/\s+/g, ' ') : null;
};

async function sheetRows(wb: ExcelJS.Workbook, name: string): Promise<Record<string, string | null>[]> {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`El archivo no tiene la hoja "${name}"`);
  const header = (ws.getRow(1).values as unknown[]).map((h) => text(h));
  const out: Record<string, string | null>[] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const values = row.values as unknown[];
    const r: Record<string, string | null> = {};
    header.forEach((h, c) => {
      if (h) r[h] = text(values[c]);
    });
    out.push(r);
  });
  return out;
}

function need(r: Record<string, string | null>, col: string): string {
  const v = r[col];
  if (!v) throw new Error(`Falta "${col}" en la fila ${JSON.stringify(r)}`);
  return v;
}

const normKey = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// Variantes de una misma materia en el Excel → nombre oficial (decisión del DECE 2026-10-05).
const SUBJECT_ALIASES: Record<string, string> = {
  MATEMATICA: 'MATEMÁTICAS',
  MATEMATICAS: 'MATEMÁTICAS',
  'MOD SOLDADURA': 'MOD. SOLDADURA',
  'MOD. SOLDADURA': 'MOD. SOLDADURA',
};
const canonicalSubject = (s: string) => SUBJECT_ALIASES[normKey(s)] ?? s;
const subjectKey = (s: string) => normKey(canonicalSubject(s));

function subjectCode(name: string, used: Set<string>) {
  const base = subjectKey(name).replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  let code = base;
  for (let n = 2; used.has(code); n++) code = `${base}-${n}`;
  used.add(code);
  return code;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const apply = args.includes('--apply');
  const periodArg = args.find((a) => a.startsWith('--period='))?.split('=')[1];
  if (!file) throw new Error('Uso: npm run import:docentes -- "ruta\\Docentes_limpio.xlsx" [--apply]');

  const zip = await JSZip.loadAsync(readFileSync(file));
  zip.remove('xl/tables');
  for (const name of Object.keys(zip.files)) {
    if (/^xl\/worksheets\/_rels\/.*\.rels$/.test(name)) {
      const rels = await zip.file(name)!.async('string');
      zip.file(name, rels.replace(/<Relationship [^>]*relationships\/table"[^>]*\/>/g, ''));
    }
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      const xml = await zip.file(name)!.async('string');
      zip.file(name, xml.replace(/<tableParts[\s\S]*?<\/tableParts>|<tableParts[^>]*\/>/g, ''));
    }
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await zip.generateAsync({ type: 'nodebuffer' })) as unknown as ExcelJS.Buffer);
  const materias = await sheetRows(wb, 'Docentes_Materias');
  const animadores = await sheetRows(wb, 'Animadores_PDF');

  const prisma = new PrismaClient();
  try {
    const period = periodArg
      ? await prisma.academicPeriod.findUniqueOrThrow({ where: { id: periodArg } })
      : await prisma.academicPeriod.findFirstOrThrow({ where: { isActive: true } });

    const levels = await prisma.level.findMany({ where: { academicPeriodId: period.id }, include: { parallels: true } });
    const parallelOf = (levelName: string, parallel: string) => {
      const level = levels.find((l) => l.name === levelName);
      if (!level) throw new Error(`Nivel inexistente en la BD: "${levelName}" (carga primero los alumnos)`);
      const p = level.parallels.find((x) => x.name === parallel);
      if (!p) throw new Error(`Paralelo inexistente en la BD: ${levelName} "${parallel}"`);
      return { level, parallel: p };
    };

    // ── Docentes (de ambas hojas) ─────────────────────────────────────
    const teachers = new Map<string, { firstName: string; lastName: string }>();
    for (const r of materias) {
      teachers.set(need(r, 'Correo').toLowerCase(), { firstName: need(r, 'Nombres'), lastName: need(r, 'Apellidos') });
    }
    for (const r of animadores) {
      const email = need(r, 'Correo').toLowerCase();
      if (!teachers.has(email)) teachers.set(email, { firstName: need(r, 'Nombres'), lastName: need(r, 'Apellidos') });
    }

    // ── Asignaciones: docente + materia + nivel → paralelos ─────────────
    const assignments = new Map<string, { email: string; subject: string; levelId: string; parallelIds: Set<string> }>();
    for (const r of materias) {
      const { level, parallel } = parallelOf(need(r, 'Nivel (BD)'), need(r, 'Paralelo'));
      const email = need(r, 'Correo').toLowerCase();
      const subject = canonicalSubject(need(r, 'Materia'));
      const key = `${email}|${subjectKey(subject)}|${level.id}`;
      const a = assignments.get(key) ?? { email, subject, levelId: level.id, parallelIds: new Set<string>() };
      a.parallelIds.add(parallel.id);
      assignments.set(key, a);
    }

    // ── Animadores: paralelo → correo ──────────────────────────────────
    const animatorOf = new Map<string, string>();
    for (const r of animadores) {
      const { parallel } = parallelOf(need(r, 'Nivel (BD)'), need(r, 'Paralelo'));
      animatorOf.set(parallel.id, need(r, 'Correo').toLowerCase());
    }

    const subjectNames = new Map<string, string>();
    for (const a of assignments.values()) if (!subjectNames.has(subjectKey(a.subject))) subjectNames.set(subjectKey(a.subject), a.subject);

    const existingTeachers = await prisma.teacher.findMany({ where: { email: { in: [...teachers.keys()] } } });
    const existingUsers = await prisma.$queryRaw<{ email: string; role: string }[]>`
      SELECT email, role::text AS role FROM identity.users`;
    const userRole = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u.role]));
    const existingSubjects = await prisma.subject.findMany();

    console.log(`Período: ${period.name}`);
    console.log(`Docentes en el archivo: ${teachers.size} (ya existen en tutorías: ${existingTeachers.length})`);
    console.log(`Usuarios nuevos en identidad: ${[...teachers.keys()].filter((e) => !userRole.has(e)).length}`);
    for (const e of teachers.keys()) {
      const role = userRole.get(e);
      if (role && role !== 'TEACHER') console.log(`  · ${e} ya existe con rol ${role}: se conserva`);
    }
    console.log(`Materias: ${subjectNames.size} (nuevas: ${[...subjectNames.keys()].filter((k) => !existingSubjects.some((s) => subjectKey(s.name) === k)).length})`);
    console.log(`Asignaciones docente-materia-nivel: ${assignments.size} (filas de paralelo: ${[...assignments.values()].reduce((n, a) => n + a.parallelIds.size, 0)})`);
    console.log(`Paralelos con animador: ${animatorOf.size}`);

    if (!apply) {
      console.log('\nSimulación: no se escribió nada. Agrega --apply para cargar.');
      return;
    }

    // ── Escritura ────────────────────────────────────────────────────
    for (const [email, t] of teachers) {
      await prisma.$executeRaw`
        INSERT INTO identity.users (id, email, "fullName", role, "isActive", "tokenVersion", "createdAt", "updatedAt")
        VALUES (${randomUUID()}, ${email}, ${`${t.firstName} ${t.lastName}`}, 'TEACHER'::identity."Role", true, 0, now(), now())
        ON CONFLICT (email) DO NOTHING`;
      await prisma.teacher.upsert({
        where: { email },
        create: { email, firstName: t.firstName, lastName: t.lastName },
        update: { firstName: t.firstName, lastName: t.lastName, isActive: true },
      });
    }
    const teacherId = new Map(
      (await prisma.teacher.findMany({ where: { email: { in: [...teachers.keys()] } } })).map((t) => [t.email, t.id]),
    );

    const usedCodes = new Set(existingSubjects.map((s) => s.code));
    const subjectId = new Map<string, string>();
    for (const [key, name] of subjectNames) {
      const found = existingSubjects.find((s) => subjectKey(s.name) === key);
      const s = found ?? (await prisma.subject.create({ data: { name, code: subjectCode(name, usedCodes) } }));
      subjectId.set(key, s.id);
    }

    let created = 0;
    for (const a of assignments.values()) {
      const where = {
        teacherId_subjectId_levelId_academicPeriodId: {
          teacherId: teacherId.get(a.email)!,
          subjectId: subjectId.get(subjectKey(a.subject))!,
          levelId: a.levelId,
          academicPeriodId: period.id,
        },
      };
      const before = await prisma.teacherAssignment.findUnique({ where });
      const parallels = [...a.parallelIds].map((parallelId) => ({ parallelId }));
      await prisma.teacherAssignment.upsert({
        where,
        create: { ...where.teacherId_subjectId_levelId_academicPeriodId, parallels: { create: parallels } },
        update: { isActive: true, parallels: { deleteMany: {}, create: parallels } },
      });
      if (!before) created++;
    }

    for (const [parallelId, email] of animatorOf) {
      await prisma.parallel.update({ where: { id: parallelId }, data: { animatorEmail: email } });
    }

    console.log(`\nListo: ${teachers.size} docentes, ${subjectNames.size} materias, ${assignments.size} asignaciones (${created} nuevas), ${animatorOf.size} animadores.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
