import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument = require('pdfkit');
import { PrismaService } from '../../prisma/prisma.service';

export type ComplianceStatus = 'COMPLETE' | 'PARTIAL' | 'NONE';

export interface ComplianceRow {
  teacherId: string;
  teacher: string;
  email: string;
  subjectId: string;
  subject: string;
  status: ComplianceStatus;
  /** Niveles (con sus paralelos) donde dicta la materia, y si tienen horario. */
  levels: { level: string; parallels: string[]; covered: boolean }[];
  /** Horarios activos declarados para esta materia y minutos semanales de tutoría. */
  rules: number;
  weeklyMinutes: number;
}

export interface ComplianceSubject {
  subjectId: string;
  subject: string;
  teachers: number;
  complete: number;
  partial: number;
  none: number;
}

/** Qué docentes incluir en las exportaciones: todos, solo los que faltan o solo los completos. */
export type ComplianceInclude = 'all' | 'pending' | 'complete';
export interface ComplianceFilters {
  subjectId?: string;
  academicPeriodId?: string;
  include?: ComplianceInclude;
}
const includes = (r: ComplianceRow, inc: ComplianceInclude = 'all') =>
  inc === 'all' || (inc === 'pending' ? r.status !== 'COMPLETE' : r.status === 'COMPLETE');
const INCLUDE_LABEL: Record<ComplianceInclude, string> = {
  all: 'Todos los docentes',
  pending: 'Solo docentes que faltan',
  complete: 'Solo docentes que ya cargaron su horario',
};
const fmtLevel = (l: { level: string; parallels: string[] }) => (l.parallels.length ? `${l.level} (${l.parallels.join(', ')})` : l.level);

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const STATUS_LABEL: Record<ComplianceStatus, string> = {
  COMPLETE: 'Completo',
  PARTIAL: 'Parcial',
  NONE: 'Sin horario',
};

/**
 * Cumplimiento de horarios de tutoría (pedido 2026-10-13): por cada materia, qué docentes que
 * la dictan ya declararon su horario en "Mi horario". Una asignación (materia + nivel) cuenta
 * como cubierta si tiene un horario activo, o si lo tiene una asignación "hermana" — la misma
 * materia en otra especialidad del mismo curso, que comparte el bloque (decisión #17).
 *   Completo   = todos los niveles donde dicta la materia tienen horario.
 *   Parcial    = algunos sí, otros no.
 *   Sin horario = ninguno.
 */
@Injectable()
export class ScheduleComplianceService {
  constructor(private prisma: PrismaService) {}

  async compute(filters: { subjectId?: string; academicPeriodId?: string }) {
    const period = filters.academicPeriodId
      ? { id: filters.academicPeriodId }
      : await this.prisma.academicPeriod.findFirst({ where: { isActive: true }, select: { id: true } });
    const assignments = await this.prisma.teacherAssignment.findMany({
      where: {
        isActive: true,
        academicPeriodId: period?.id,
        subjectId: filters.subjectId || undefined,
        teacher: { isActive: true },
      },
      include: {
        teacher: true,
        subject: true,
        level: true,
        parallels: { include: { parallel: true } },
        availabilityRules: { where: { isActive: true } },
      },
    });

    // Agrupa por docente + materia; el "curso" (grado + nivel educativo) une especialidades.
    const groups = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const key = `${a.teacherId}|${a.subjectId}`;
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }

    const rows: ComplianceRow[] = [];
    for (const list of groups.values()) {
      const courseKey = (a: (typeof list)[number]) =>
        a.level.grade != null && a.level.educationLevel ? `${a.level.educationLevel}|${a.level.grade}` : `level|${a.levelId}`;
      const coveredCourses = new Set(list.filter((a) => a.availabilityRules.length > 0).map(courseKey));
      const levels = list
        .map((a) => ({
          level: a.level.name,
          order: a.level.order,
          parallels: a.parallels.map((p) => p.parallel.name).sort((x, y) => x.localeCompare(y, 'es', { numeric: true })),
          covered: a.availabilityRules.length > 0 || coveredCourses.has(courseKey(a)),
        }))
        .sort((x, y) => x.order - y.order || x.level.localeCompare(y.level, 'es'))
        .map(({ order: _order, ...l }) => l);
      const coveredCount = levels.filter((l) => l.covered).length;
      const rules = list.flatMap((a) => a.availabilityRules);
      const t = list[0].teacher;
      rows.push({
        teacherId: t.id,
        teacher: `${t.lastName} ${t.firstName}`.trim(),
        email: t.email,
        subjectId: list[0].subjectId,
        subject: list[0].subject.name,
        status: coveredCount === levels.length ? 'COMPLETE' : coveredCount === 0 ? 'NONE' : 'PARTIAL',
        levels,
        rules: rules.length,
        weeklyMinutes: rules.reduce((m, r) => m + (toMin(r.endTime) - toMin(r.startTime)), 0),
      });
    }
    rows.sort((a, b) => a.subject.localeCompare(b.subject, 'es') || a.teacher.localeCompare(b.teacher, 'es'));

    const bySubject = new Map<string, ComplianceSubject>();
    for (const r of rows) {
      const s = bySubject.get(r.subjectId) ?? { subjectId: r.subjectId, subject: r.subject, teachers: 0, complete: 0, partial: 0, none: 0 };
      s.teachers++;
      if (r.status === 'COMPLETE') s.complete++;
      else if (r.status === 'PARTIAL') s.partial++;
      else s.none++;
      bySubject.set(r.subjectId, s);
    }
    const subjects = [...bySubject.values()].sort((a, b) => a.subject.localeCompare(b.subject, 'es'));
    const totals = {
      subjects: subjects.length,
      subjectsComplete: subjects.filter((s) => s.complete === s.teachers).length,
      // Un docente cuenta como "al día" si tiene horario completo en TODAS sus materias.
      teachers: new Set(rows.map((r) => r.teacherId)).size,
      teachersComplete: [...new Set(rows.map((r) => r.teacherId))].filter((id) =>
        rows.filter((r) => r.teacherId === id).every((r) => r.status === 'COMPLETE'),
      ).length,
    };
    return { subjects, rows, totals };
  }

  async xlsx(filters: ComplianceFilters): Promise<Buffer> {
    const data = await this.compute(filters);
    const rows = data.rows.filter((r) => includes(r, filters.include));
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistema DECE · UETS';
    const font = { name: 'Arial', size: 10 };
    const head = (ws: ExcelJS.Worksheet, row: number) => {
      ws.getRow(row).eachCell((c) => {
        c.font = { ...font, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6F5C' } };
      });
    };

    const s1 = wb.addWorksheet('Por materia', { views: [{ state: 'frozen', ySplit: 3 }] });
    s1.getCell('A1').value = 'Horarios de tutoría declarados por materia';
    s1.getCell('A1').font = { name: 'Arial', size: 14, bold: true };
    s1.getCell('A2').value = `Generado el ${new Date().toISOString().slice(0, 10)} · Sistema DECE UETS`;
    s1.getCell('A2').font = { ...font, italic: true, color: { argb: 'FF5B665F' } };
    s1.addRow(['Materia', 'Docentes', 'Completo', 'Parcial', 'Sin horario', '% completo']);
    head(s1, 3);
    data.subjects.forEach((s, i) => {
      const r = 4 + i;
      s1.addRow([s.subject, s.teachers, s.complete, s.partial, s.none, { formula: `IF(B${r}=0,0,C${r}/B${r})` }]).font = font;
      s1.getCell(`F${r}`).numFmt = '0%';
    });
    s1.columns = [{ width: 52 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 12 }];

    const s2 = wb.addWorksheet('Por docente', { views: [{ state: 'frozen', ySplit: 1 }] });
    s2.addRow(['Materia', 'Docente', 'Correo', 'Estado', 'Niveles con horario', 'Niveles sin horario', 'Horarios', 'Minutos/semana']);
    head(s2, 1);
    for (const r of rows) {
      const fmt = (l: ComplianceRow['levels'][number]) => (l.parallels.length ? `${l.level} (${l.parallels.join(', ')})` : l.level);
      const row = s2.addRow([
        r.subject,
        r.teacher,
        r.email,
        STATUS_LABEL[r.status],
        r.levels.filter((l) => l.covered).map(fmt).join('; '),
        r.levels.filter((l) => !l.covered).map(fmt).join('; '),
        r.rules,
        r.weeklyMinutes,
      ]);
      row.font = font;
      if (r.status !== 'COMPLETE') {
        row.getCell(4).font = { ...font, bold: true, color: { argb: r.status === 'NONE' ? 'FFA33A2C' : 'FF8A5A00' } };
      }
    }
    s2.columns = [{ width: 36 }, { width: 38 }, { width: 30 }, { width: 13 }, { width: 50 }, { width: 50 }, { width: 10 }, { width: 15 }];
    s2.autoFilter = { from: 'A1', to: 'H1' };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /**
   * PDF para imprimir o enviar (pedido 2026-10-14): por cada materia (o solo la elegida), los
   * docentes que FALTAN —con los niveles y paralelos sin horario— y los que YA CARGARON su horario.
   */
  async pdf(filters: ComplianceFilters): Promise<Buffer> {
    const data = await this.compute(filters);
    const inc = filters.include ?? 'all';
    const subjectName = filters.subjectId ? (data.subjects[0]?.subject ?? 'Materia') : 'Todas las materias';

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      bufferPages: true,
      info: { Title: 'Horarios de tutoría declarados', Author: 'Sistema DECE · UETS' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const GREEN = '#1f6f5c';
    const INK = '#141a17';
    const SOFT = '#5b665f';
    const LINE = '#e2e5e1';
    const RED = '#a33a2c';
    const AMBER = '#8a5a00';
    const L = doc.page.margins.left;
    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 14;
    const ensure = (h: number) => {
      if (doc.y + h > bottom()) doc.addPage();
    };

    // Encabezado
    doc.rect(L, 36, W, 58).fill(GREEN);
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(16).text('Horarios de tutoría declarados por los docentes', L + 14, 46);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .text(
        `Unidad Educativa Técnico Salesiano · DECE   ·   ${subjectName}   ·   ${INCLUDE_LABEL[inc]}   ·   Generado el ${new Date().toISOString().slice(0, 10)}`,
        L + 14,
        70,
      );
    doc.y = 108;

    // Indicadores (de la materia elegida o de todas)
    const complete = data.rows.filter((r) => r.status === 'COMPLETE').length;
    const partial = data.rows.filter((r) => r.status === 'PARTIAL').length;
    const none = data.rows.filter((r) => r.status === 'NONE').length;
    const kpis: [string, string, string][] = [
      ['Docente-materia', String(data.rows.length), INK],
      ['Ya cargaron', String(complete), GREEN],
      ['Parcial', String(partial), AMBER],
      ['Sin horario', String(none), RED],
      ['Avance', `${data.rows.length ? Math.round((complete / data.rows.length) * 100) : 0}%`, INK],
    ];
    const kw = (W - 4 * 8) / 5;
    const ky = doc.y;
    kpis.forEach(([label, value, color], i) => {
      const x = L + i * (kw + 8);
      doc.roundedRect(x, ky, kw, 46, 4).strokeColor(LINE).lineWidth(1).stroke();
      doc.fill(SOFT).font('Helvetica').fontSize(8.5).text(label, x + 10, ky + 8, { width: kw - 20 });
      doc.fill(color).font('Helvetica-Bold').fontSize(17).text(value, x + 10, ky + 20, { width: kw - 20 });
    });
    doc.y = ky + 62;

    type Col = { title: string; w: number; align?: 'left' | 'center' };
    const table = (cols: Col[], rows: { cells: string[]; colors?: (string | undefined)[] }[]) => {
      const header = () => {
        ensure(22);
        const y = doc.y;
        let x = L;
        doc.rect(L, y, W, 18).fill('#e4efec');
        cols.forEach((c) => {
          doc.fill('#123f34').font('Helvetica-Bold').fontSize(8).text(c.title.toUpperCase(), x + 5, y + 5, { width: c.w - 10, align: c.align ?? 'left' });
          x += c.w;
        });
        doc.y = y + 18;
      };
      header();
      for (const row of rows) {
        doc.font('Helvetica').fontSize(8.5);
        const h = Math.max(...row.cells.map((t, i) => doc.heightOfString(t || '—', { width: cols[i].w - 10 }))) + 8;
        if (doc.y + h > bottom()) {
          doc.addPage();
          header();
        }
        const y = doc.y;
        let x = L;
        row.cells.forEach((t, i) => {
          doc
            .fill(row.colors?.[i] ?? INK)
            .font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(8.5)
            .text(t || '—', x + 5, y + 4, { width: cols[i].w - 10, align: cols[i].align ?? 'left' });
          x += cols[i].w;
        });
        doc.y = y + h;
        doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor(LINE).lineWidth(0.6).stroke();
      }
      doc.y += 10;
    };
    const section = (title: string, color = GREEN) => {
      ensure(44);
      doc.fill(color).font('Helvetica-Bold').fontSize(11.5).text(title, L, doc.y);
      doc.y += 4;
    };
    const pct = (s: ComplianceSubject) => `${Math.round((s.complete / s.teachers) * 100)}%`;

    // Resumen por materia (cuando son todas)
    if (!filters.subjectId) {
      section('Resumen por materia');
      table(
        [
          { title: 'Materia', w: W * 0.46 },
          { title: 'Docentes', w: W * 0.1, align: 'center' },
          { title: 'Ya cargaron', w: W * 0.11, align: 'center' },
          { title: 'Parcial', w: W * 0.1, align: 'center' },
          { title: 'Sin horario', w: W * 0.11, align: 'center' },
          { title: 'Avance', w: W * 0.12, align: 'center' },
        ],
        [...data.subjects]
          .sort((a, b) => b.partial + b.none - (a.partial + a.none) || a.subject.localeCompare(b.subject, 'es'))
          .map((s) => ({
            cells: [s.subject, String(s.teachers), String(s.complete), String(s.partial), String(s.none), pct(s)],
            colors: [undefined, undefined, GREEN, s.partial ? AMBER : undefined, s.none ? RED : undefined, undefined],
          })),
      );
    }

    // Detalle por materia: docentes que faltan y que ya cargaron
    let firstDetail = true;
    for (const s of data.subjects) {
      const rows = data.rows.filter((r) => r.subjectId === s.subjectId);
      const pending = rows.filter((r) => r.status !== 'COMPLETE' && includes(r, inc));
      const ok = rows.filter((r) => r.status === 'COMPLETE' && includes(r, inc));
      if (!pending.length && !ok.length) continue;
      if (!filters.subjectId) {
        // El detalle empieza en página nueva tras el resumen; luego las materias siguen una tras
        // otra y solo saltan de página si no cabe el encabezado con algunas filas.
        if (firstDetail) doc.addPage();
        else {
          ensure(130);
          doc.y += 12;
        }
        firstDetail = false;
      }
      doc.fill(INK).font('Helvetica-Bold').fontSize(14).text(s.subject, L, doc.y);
      doc
        .fill(SOFT)
        .font('Helvetica')
        .fontSize(9.5)
        .text(`${s.teachers} docentes · ${s.complete} ya cargaron · ${s.partial} parcial · ${s.none} sin horario · avance ${pct(s)}`);
      doc.y += 8;
      if (pending.length) {
        section(`Faltan por cargar su horario (${pending.length})`, RED);
        table(
          [
            { title: 'Docente', w: W * 0.28 },
            { title: 'Correo', w: W * 0.2 },
            { title: 'Estado', w: W * 0.1 },
            { title: 'Niveles sin horario', w: W * 0.42 },
          ],
          pending.map((r) => ({
            cells: [r.teacher, r.email, STATUS_LABEL[r.status], r.levels.filter((l) => !l.covered).map(fmtLevel).join('\n')],
            colors: [undefined, SOFT, r.status === 'NONE' ? RED : AMBER, RED],
          })),
        );
      }
      if (ok.length) {
        section(`Ya cargaron su horario (${ok.length})`);
        table(
          [
            { title: 'Docente', w: W * 0.28 },
            { title: 'Correo', w: W * 0.2 },
            { title: 'Niveles con horario', w: W * 0.36 },
            { title: 'Horarios', w: W * 0.08, align: 'center' },
            { title: 'Min/sem.', w: W * 0.08, align: 'center' },
          ],
          ok.map((r) => ({
            cells: [r.teacher, r.email, r.levels.map(fmtLevel).join('\n'), String(r.rules), String(r.weeklyMinutes)],
            colors: [undefined, SOFT],
          })),
        );
      }
    }
    if (!data.rows.some((r) => includes(r, inc))) {
      section('No hay docentes que coincidan con el filtro.', SOFT);
    }

    // Pie con numeración
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      // Se escribe dentro del margen inferior: sin bajarlo a 0, pdfkit agregaría una página nueva.
      const marginBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - marginBottom + 6;
      doc.fill(SOFT).font('Helvetica').fontSize(7.5);
      doc.text(`Sistema DECE · Horarios de tutoría · ${subjectName}`, L, y, { width: W / 2, lineBreak: false });
      doc.text(`Página ${i + 1} de ${range.count}`, L + W / 2, y, { width: W / 2, align: 'right', lineBreak: false });
      doc.page.margins.bottom = marginBottom;
    }
    doc.end();
    return done;
  }
}
