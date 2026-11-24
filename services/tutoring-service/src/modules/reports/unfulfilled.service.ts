import { Injectable } from '@nestjs/common';
import { Prisma, SessionStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import PDFDocument = require('pdfkit');
import { PrismaService } from '../../prisma/prisma.service';
import { ReportFiltersDto } from './dto/report-filters.dto';

/**
 * Tutorías no realizadas o no completadas (pedido 2026-11-24):
 *  - NOT_HELD: estaba programada y nunca se inició; el sistema la cerró al vencer el bloque (R7)
 *    → startedAt null.
 *  - NOT_CLOSED: se inició pero el docente no la finalizó; la cerró el sistema (autoCompleted).
 *    Puede tener el informe aún pendiente.
 *  - CANCELLED: cancelada (con motivo y quién la canceló).
 * Finalizar exige el informe, así que una tutoría cerrada por el docente siempre lo tiene.
 */
export type UnfulfilledKind = 'NOT_HELD' | 'NOT_CLOSED' | 'CANCELLED';
export const UNFULFILLED_KINDS: UnfulfilledKind[] = ['NOT_HELD', 'NOT_CLOSED', 'CANCELLED'];
export const KIND_LABEL: Record<UnfulfilledKind, string> = {
  NOT_HELD: 'No realizada',
  NOT_CLOSED: 'No finalizada por el docente',
  CANCELLED: 'Cancelada',
};

export interface UnfulfilledRow {
  id: string;
  kind: UnfulfilledKind;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  teacher: string;
  teacherEmail: string;
  subject: string;
  level: string;
  parallels: string[];
  students: number;
  location: string | null;
  /** NOT_CLOSED: si el docente ya entregó el informe después del cierre automático. */
  reportPending: boolean;
  cancelReason: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
}

const SESSION_INCLUDE = {
  teacher: true,
  subject: true,
  level: true,
  report: { select: { id: true } },
  cancelledBy: { select: { email: true } },
  enrollments: { include: { student: { include: { parallel: true } } } },
} satisfies Prisma.TutoringSessionInclude;

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const byNum = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true });

@Injectable()
export class UnfulfilledReportService {
  constructor(private prisma: PrismaService) {}

  async compute(filters: ReportFiltersDto, kind?: UnfulfilledKind) {
    const kindWhere: Record<UnfulfilledKind, Prisma.TutoringSessionWhereInput> = {
      NOT_HELD: { status: SessionStatus.COMPLETED, startedAt: null },
      NOT_CLOSED: { status: SessionStatus.COMPLETED, autoCompleted: true, startedAt: { not: null } },
      CANCELLED: { status: SessionStatus.CANCELLED },
    };
    const sessions = await this.prisma.tutoringSession.findMany({
      where: {
        AND: [
          { OR: (kind ? [kind] : UNFULFILLED_KINDS).map((k) => kindWhere[k]) },
          {
            academicPeriodId: filters.academicPeriodId,
            teacherId: filters.teacherId,
            subjectId: filters.subjectId,
            levelId: filters.levelId,
            // Por curso = por el paralelo de los alumnos (igual que el resto de reportes).
            enrollments: filters.parallelId ? { some: { student: { parallelId: filters.parallelId } } } : undefined,
            date: {
              gte: filters.from ? new Date(filters.from) : undefined,
              lte: filters.to ? new Date(filters.to) : undefined,
            },
          },
        ],
      },
      include: SESSION_INCLUDE,
      orderBy: [{ date: 'desc' }, { startTime: 'asc' }],
    });

    const rows: UnfulfilledRow[] = sessions.map((s) => {
      const k: UnfulfilledKind =
        s.status === SessionStatus.CANCELLED ? 'CANCELLED' : s.startedAt ? 'NOT_CLOSED' : 'NOT_HELD';
      const enrollments = filters.parallelId
        ? s.enrollments.filter((e) => e.student.parallelId === filters.parallelId)
        : s.enrollments;
      return {
        id: s.id,
        kind: k,
        date: ymd(s.date),
        startTime: s.startTime,
        endTime: s.endTime,
        teacher: `${s.teacher.firstName} ${s.teacher.lastName}`,
        teacherEmail: s.teacher.email,
        subject: s.subject.name,
        level: s.level.name,
        parallels: [...new Set(enrollments.map((e) => e.student.parallel.name))].sort(byNum),
        students: enrollments.length,
        location: s.location,
        reportPending: k === 'NOT_CLOSED' && !s.report,
        cancelReason: s.cancelReason,
        cancelledBy: s.cancelledBy?.email ?? null,
        cancelledAt: s.cancelledAt ? s.cancelledAt.toISOString() : null,
      };
    });

    const totals = Object.fromEntries(UNFULFILLED_KINDS.map((k) => [k, rows.filter((r) => r.kind === k).length])) as Record<
      UnfulfilledKind,
      number
    >;
    const teacherMap = new Map<string, { teacher: string; email: string; counts: Record<UnfulfilledKind, number>; total: number }>();
    for (const r of rows) {
      const t = teacherMap.get(r.teacherEmail) ?? {
        teacher: r.teacher,
        email: r.teacherEmail,
        counts: { NOT_HELD: 0, NOT_CLOSED: 0, CANCELLED: 0 },
        total: 0,
      };
      t.counts[r.kind]++;
      t.total++;
      teacherMap.set(r.teacherEmail, t);
    }
    const byTeacher = [...teacherMap.values()].sort((a, b) => b.total - a.total || a.teacher.localeCompare(b.teacher, 'es'));
    return { rows, totals, total: rows.length, reportsPending: rows.filter((r) => r.reportPending).length, byTeacher };
  }

  async xlsx(filters: ReportFiltersDto, kind?: UnfulfilledKind): Promise<Buffer> {
    const data = await this.compute(filters, kind);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistema DECE · UETS';
    const font = { name: 'Arial', size: 10 };
    const head = (ws: ExcelJS.Worksheet, row: number) => {
      ws.getRow(row).eachCell((c) => {
        c.font = { ...font, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6F5C' } };
      });
    };

    const s1 = wb.addWorksheet('Tutorías', { views: [{ state: 'frozen', ySplit: 3 }] });
    s1.getCell('A1').value = 'Tutorías no realizadas o no completadas';
    s1.getCell('A1').font = { name: 'Arial', size: 14, bold: true };
    s1.getCell('A2').value = `Generado el ${ymd(new Date())} · Sistema DECE UETS${kind ? ` · Solo: ${KIND_LABEL[kind]}` : ''}`;
    s1.getCell('A2').font = { ...font, italic: true, color: { argb: 'FF5B665F' } };
    s1.addRow(['Fecha', 'Hora', 'Estado', 'Docente', 'Correo', 'Materia', 'Curso', 'Paralelos', 'Alumnos', 'Lugar', 'Informe', 'Motivo de cancelación', 'Cancelada por']);
    head(s1, 3);
    for (const r of data.rows) {
      const row = s1.addRow([
        r.date,
        `${r.startTime}–${r.endTime}`,
        KIND_LABEL[r.kind],
        r.teacher,
        r.teacherEmail,
        r.subject,
        r.level,
        r.parallels.join(', '),
        r.students,
        r.location ?? '',
        r.kind === 'NOT_CLOSED' ? (r.reportPending ? 'Pendiente' : 'Entregado después') : '',
        r.cancelReason ?? '',
        r.cancelledBy ?? '',
      ]);
      row.font = font;
      row.getCell(3).font = { ...font, bold: true, color: { argb: r.kind === 'CANCELLED' ? 'FF5B665F' : 'FFA33A2C' } };
    }
    s1.columns = [
      { width: 12 }, { width: 13 }, { width: 28 }, { width: 34 }, { width: 28 }, { width: 34 }, { width: 40 },
      { width: 11 }, { width: 9 }, { width: 22 }, { width: 17 }, { width: 40 }, { width: 28 },
    ];
    s1.autoFilter = { from: 'A3', to: 'M3' };

    const s2 = wb.addWorksheet('Por docente', { views: [{ state: 'frozen', ySplit: 1 }] });
    s2.addRow(['Docente', 'Correo', KIND_LABEL.NOT_HELD, KIND_LABEL.NOT_CLOSED, KIND_LABEL.CANCELLED, 'Total']);
    head(s2, 1);
    data.byTeacher.forEach((t, i) => {
      const r = 2 + i;
      s2.addRow([t.teacher, t.email, t.counts.NOT_HELD, t.counts.NOT_CLOSED, t.counts.CANCELLED, { formula: `SUM(C${r}:E${r})` }]).font = font;
    });
    s2.columns = [{ width: 38 }, { width: 30 }, { width: 15 }, { width: 28 }, { width: 12 }, { width: 9 }];
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async pdf(filters: ReportFiltersDto, kind?: UnfulfilledKind): Promise<Buffer> {
    const data = await this.compute(filters, kind);
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      bufferPages: true,
      info: { Title: 'Tutorías no realizadas o no completadas', Author: 'Sistema DECE · UETS' },
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
    const KIND_COLOR: Record<UnfulfilledKind, string> = { NOT_HELD: RED, NOT_CLOSED: AMBER, CANCELLED: SOFT };
    const L = doc.page.margins.left;
    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom - 14;
    const ensure = (h: number) => {
      if (doc.y + h > bottom()) doc.addPage();
    };

    const range = [filters.from, filters.to].some(Boolean) ? `${filters.from ?? '…'} a ${filters.to ?? '…'}` : 'Todas las fechas';
    doc.rect(L, 36, W, 58).fill(GREEN);
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(16).text('Tutorías no realizadas o no completadas', L + 14, 46);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .text(
        [
          'Unidad Educativa Técnico Salesiano · DECE',
          range,
          kind ? KIND_LABEL[kind] : 'Todos los estados',
          `Generado el ${ymd(new Date())}`,
        ]
          .filter(Boolean)
          .join('   ·   '),
        L + 14,
        70,
      );
    doc.y = 108;

    const kpis: [string, string, string][] = [
      ['Total', String(data.total), INK],
      [KIND_LABEL.NOT_HELD, String(data.totals.NOT_HELD), RED],
      [KIND_LABEL.NOT_CLOSED, String(data.totals.NOT_CLOSED), AMBER],
      ['Informes pendientes', String(data.reportsPending), AMBER],
      [KIND_LABEL.CANCELLED, String(data.totals.CANCELLED), SOFT],
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
        ensure(60);
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
    const section = (title: string) => {
      ensure(80);
      doc.fill(GREEN).font('Helvetica-Bold').fontSize(11.5).text(title, L, doc.y);
      doc.y += 4;
    };

    if (!data.total) {
      section('No hay tutorías no realizadas ni no completadas con estos filtros.');
    } else {
      section('Por docente');
      table(
        [
          { title: 'Docente', w: W * 0.32 },
          { title: 'Correo', w: W * 0.26 },
          { title: KIND_LABEL.NOT_HELD, w: W * 0.11, align: 'center' },
          { title: 'No finalizadas', w: W * 0.11, align: 'center' },
          { title: KIND_LABEL.CANCELLED, w: W * 0.1, align: 'center' },
          { title: 'Total', w: W * 0.1, align: 'center' },
        ],
        data.byTeacher.map((t) => ({
          cells: [t.teacher, t.email, String(t.counts.NOT_HELD), String(t.counts.NOT_CLOSED), String(t.counts.CANCELLED), String(t.total)],
          colors: [undefined, SOFT, t.counts.NOT_HELD ? RED : undefined, t.counts.NOT_CLOSED ? AMBER : undefined],
        })),
      );

      ensure(130);
      doc.y += 8;
      section(`Detalle (${data.total})`);
      table(
        [
          { title: 'Fecha', w: W * 0.08 },
          { title: 'Hora', w: W * 0.08 },
          { title: 'Estado', w: W * 0.12 },
          { title: 'Docente', w: W * 0.17 },
          { title: 'Materia', w: W * 0.16 },
          { title: 'Curso · paralelos', w: W * 0.17 },
          { title: 'Alumnos', w: W * 0.07, align: 'center' },
          { title: 'Detalle', w: W * 0.15 },
        ],
        data.rows.map((r) => ({
          cells: [
            r.date,
            `${r.startTime}–${r.endTime}`,
            KIND_LABEL[r.kind],
            r.teacher,
            r.subject,
            `${r.level}${r.parallels.length ? ` · ${r.parallels.join(', ')}` : ''}`,
            String(r.students),
            r.kind === 'CANCELLED'
              ? `${r.cancelReason ?? 'Sin motivo'}${r.cancelledBy ? ` (${r.cancelledBy})` : ''}`
              : r.kind === 'NOT_CLOSED'
                ? r.reportPending
                  ? 'Informe pendiente'
                  : 'Informe entregado después'
                : 'Nunca se inició',
          ],
          colors: [undefined, undefined, KIND_COLOR[r.kind], undefined, undefined, undefined, undefined, SOFT],
        })),
      );
    }

    const pages = doc.bufferedPageRange();
    for (let i = pages.start; i < pages.start + pages.count; i++) {
      doc.switchToPage(i);
      // Se escribe dentro del margen inferior: sin bajarlo a 0, pdfkit agregaría una página nueva.
      const marginBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - marginBottom + 6;
      doc.fill(SOFT).font('Helvetica').fontSize(7.5);
      doc.text('Sistema DECE · Tutorías no realizadas o no completadas', L, y, { width: W / 2, lineBreak: false });
      doc.text(`Página ${i + 1} de ${pages.count}`, L + W / 2, y, { width: W / 2, align: 'right', lineBreak: false });
      doc.page.margins.bottom = marginBottom;
    }
    doc.end();
    return done;
  }
}
