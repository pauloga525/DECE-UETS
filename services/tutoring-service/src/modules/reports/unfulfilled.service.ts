import { Injectable } from '@nestjs/common';
import { Prisma, SessionStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { createPdfReport, dateRangeLabel, PDF_COLORS } from './pdf-report';

/**
 * Tutorías no realizadas o no completadas (pedido 2026-11-24):
 *  - NOT_HELD: estaba programada y nunca se inició; el sistema la cerró al vencer el bloque (R7)
 *    → startedAt null. El docente puede explicar por qué (notHeldReason).
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
  /**
   * Lo que dejó escrito el docente: por qué no la realizó (NOT_HELD), las observaciones del
   * informe (NOT_CLOSED) o el motivo de la cancelación (CANCELLED). null = sin observación.
   */
  observation: string | null;
  /** NOT_CLOSED: si el docente aún no entrega el informe tras el cierre automático. */
  reportPending: boolean;
  cancelledBy: string | null;
}

const SESSION_INCLUDE = {
  teacher: true,
  subject: true,
  level: true,
  report: { select: { observations: true } },
  cancelledBy: { select: { email: true } },
  enrollments: { include: { student: { include: { parallel: true } } } },
} satisfies Prisma.TutoringSessionInclude;

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const byNum = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true });

/** Texto de la columna "Observación del docente" para Excel/PDF. */
export function observationText(r: UnfulfilledRow) {
  if (r.kind === 'NOT_CLOSED' && r.reportPending) return 'Informe pendiente';
  if (!r.observation) return 'Sin observación';
  return r.kind === 'CANCELLED' && r.cancelledBy ? `${r.observation} (${r.cancelledBy})` : r.observation;
}

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
        observation:
          k === 'NOT_HELD' ? s.notHeldReason : k === 'NOT_CLOSED' ? (s.report?.observations ?? null) : s.cancelReason,
        reportPending: k === 'NOT_CLOSED' && !s.report,
        cancelledBy: s.cancelledBy?.email ?? null,
      };
    });

    const totals = Object.fromEntries(UNFULFILLED_KINDS.map((k) => [k, rows.filter((r) => r.kind === k).length])) as Record<
      UnfulfilledKind,
      number
    >;
    const teacherMap = new Map<
      string,
      { teacher: string; email: string; counts: Record<UnfulfilledKind, number>; total: number; withoutReason: number }
    >();
    for (const r of rows) {
      const t = teacherMap.get(r.teacherEmail) ?? {
        teacher: r.teacher,
        email: r.teacherEmail,
        counts: { NOT_HELD: 0, NOT_CLOSED: 0, CANCELLED: 0 },
        total: 0,
        withoutReason: 0,
      };
      t.counts[r.kind]++;
      t.total++;
      if (r.kind === 'NOT_HELD' && !r.observation) t.withoutReason++;
      teacherMap.set(r.teacherEmail, t);
    }
    const byTeacher = [...teacherMap.values()].sort((a, b) => b.total - a.total || a.teacher.localeCompare(b.teacher, 'es'));
    return {
      rows,
      totals,
      total: rows.length,
      reportsPending: rows.filter((r) => r.reportPending).length,
      /** No realizadas en las que el docente no explicó por qué. */
      notHeldWithoutReason: rows.filter((r) => r.kind === 'NOT_HELD' && !r.observation).length,
      byTeacher,
    };
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
    s1.addRow(['Fecha', 'Hora', 'Estado', 'Docente', 'Correo', 'Materia', 'Curso', 'Paralelos', 'Alumnos', 'Lugar', 'Observación del docente']);
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
        observationText(r),
      ]);
      row.font = font;
      row.getCell(3).font = { ...font, bold: true, color: { argb: r.kind === 'CANCELLED' ? 'FF5B665F' : 'FFA33A2C' } };
      if (!r.observation || r.reportPending) row.getCell(11).font = { ...font, italic: true, color: { argb: 'FFA33A2C' } };
    }
    s1.columns = [
      { width: 12 }, { width: 13 }, { width: 28 }, { width: 34 }, { width: 28 }, { width: 34 }, { width: 40 },
      { width: 11 }, { width: 9 }, { width: 22 }, { width: 60 },
    ];
    s1.getColumn(11).alignment = { wrapText: true, vertical: 'top' };
    s1.autoFilter = { from: 'A3', to: 'K3' };

    const s2 = wb.addWorksheet('Por docente', { views: [{ state: 'frozen', ySplit: 1 }] });
    s2.addRow(['Docente', 'Correo', KIND_LABEL.NOT_HELD, 'No realizadas sin observación', KIND_LABEL.NOT_CLOSED, KIND_LABEL.CANCELLED, 'Total']);
    head(s2, 1);
    data.byTeacher.forEach((t, i) => {
      const r = 2 + i;
      s2.addRow([
        t.teacher,
        t.email,
        t.counts.NOT_HELD,
        t.withoutReason,
        t.counts.NOT_CLOSED,
        t.counts.CANCELLED,
        { formula: `C${r}+E${r}+F${r}` },
      ]).font = font;
    });
    s2.columns = [{ width: 38 }, { width: 30 }, { width: 14 }, { width: 28 }, { width: 28 }, { width: 12 }, { width: 9 }];
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async pdf(filters: ReportFiltersDto, kind?: UnfulfilledKind): Promise<Buffer> {
    const data = await this.compute(filters, kind);
    const { INK, SOFT, RED, AMBER } = PDF_COLORS;
    const KIND_COLOR: Record<UnfulfilledKind, string> = { NOT_HELD: RED, NOT_CLOSED: AMBER, CANCELLED: SOFT };
    const pdf = createPdfReport(
      'Tutorías no realizadas o no completadas',
      [dateRangeLabel(filters.from, filters.to), kind ? KIND_LABEL[kind] : 'Todos los estados', `Generado el ${ymd(new Date())}`],
      'Sistema DECE · Tutorías no realizadas o no completadas',
    );
    pdf.kpis([
      ['Total', data.total, INK],
      [KIND_LABEL.NOT_HELD, data.totals.NOT_HELD, RED],
      ['No realizadas sin observación', data.notHeldWithoutReason, RED],
      [KIND_LABEL.NOT_CLOSED, data.totals.NOT_CLOSED, AMBER],
      [KIND_LABEL.CANCELLED, data.totals.CANCELLED, SOFT],
    ]);

    if (!data.total) {
      pdf.section('No hay tutorías no realizadas ni no completadas con estos filtros.');
      return pdf.end();
    }
    pdf.section('Por docente');
    pdf.table(
      [
        { title: 'Docente', w: 0.3 },
        { title: 'Correo', w: 0.24 },
        { title: KIND_LABEL.NOT_HELD, w: 0.1, align: 'center' },
        { title: 'Sin observación', w: 0.1, align: 'center' },
        { title: 'No finalizadas', w: 0.09, align: 'center' },
        { title: KIND_LABEL.CANCELLED, w: 0.09, align: 'center' },
        { title: 'Total', w: 0.08, align: 'center' },
      ],
      data.byTeacher.map((t) => ({
        cells: [
          t.teacher,
          t.email,
          String(t.counts.NOT_HELD),
          String(t.withoutReason),
          String(t.counts.NOT_CLOSED),
          String(t.counts.CANCELLED),
          String(t.total),
        ],
        colors: [undefined, SOFT, t.counts.NOT_HELD ? RED : undefined, t.withoutReason ? RED : undefined, t.counts.NOT_CLOSED ? AMBER : undefined],
      })),
    );

    pdf.space(8);
    pdf.section(`Detalle (${data.total})`);
    pdf.table(
      [
        { title: 'Fecha', w: 0.08 },
        { title: 'Hora', w: 0.08 },
        { title: 'Estado', w: 0.1 },
        { title: 'Docente', w: 0.15 },
        { title: 'Materia', w: 0.14 },
        { title: 'Curso · paralelos', w: 0.15 },
        { title: 'Alumnos', w: 0.07, align: 'center' },
        { title: 'Observación del docente', w: 0.23 },
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
          observationText(r),
        ],
        colors: [
          undefined,
          undefined,
          KIND_COLOR[r.kind],
          undefined,
          undefined,
          undefined,
          undefined,
          !r.observation || r.reportPending ? RED : INK,
        ],
      })),
    );
    return pdf.end();
  }
}
