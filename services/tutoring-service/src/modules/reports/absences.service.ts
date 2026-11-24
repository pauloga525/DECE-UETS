import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { createPdfReport, dateRangeLabel, PDF_COLORS } from './pdf-report';

/** Nota que deja el sistema cuando el docente no tomó lista antes del cierre automático. */
const AUTO_NOTE_PREFIX = 'Registrado automáticamente';

export interface AbsenceRow {
  enrollmentId: string;
  sessionId: string;
  student: string;
  identification: string;
  level: string;
  parallel: string;
  subject: string;
  teacher: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  justified: boolean;
  /** Observación del docente al tomar lista (por qué no asistió). null = sin observación. */
  note: string | null;
  /** El docente no tomó lista: el sistema lo marcó ausente al cerrar la tutoría. */
  automatic: boolean;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** "MATEMÁTICAS — Juan Pérez (2)", una línea por materia. */
const fmtSubjects = (subjects: { subject: string; teacher: string; absences: number }[]) =>
  subjects.map((x) => `${x.subject} — ${x.teacher} (${x.absences})`).join('\n');

/**
 * Inasistencias de estudiantes (pedido 2026-11-24): cada alumno que no asistió a una tutoría que
 * sí se realizó, con materia, docente, fecha y la observación que anotó el docente.
 */
@Injectable()
export class AbsencesReportService {
  constructor(private prisma: PrismaService) {}

  async compute(filters: ReportFiltersDto) {
    const enrollments = await this.prisma.tutoringEnrollment.findMany({
      where: {
        status: { in: [EnrollmentStatus.ABSENT, EnrollmentStatus.JUSTIFIED] },
        student: filters.parallelId ? { parallelId: filters.parallelId } : undefined,
        tutoringSession: {
          // Solo tutorías que ocurrieron: una no iniciada no es inasistencia del alumno.
          startedAt: { not: null },
          academicPeriodId: filters.academicPeriodId,
          teacherId: filters.teacherId,
          subjectId: filters.subjectId,
          levelId: filters.levelId,
          date: {
            gte: filters.from ? new Date(filters.from) : undefined,
            lte: filters.to ? new Date(filters.to) : undefined,
          },
        },
      },
      include: {
        attendance: true,
        student: { include: { level: true, parallel: true } },
        tutoringSession: { include: { subject: true, teacher: true } },
      },
      orderBy: [{ tutoringSession: { date: 'desc' } }, { tutoringSession: { startTime: 'asc' } }],
    } satisfies Prisma.TutoringEnrollmentFindManyArgs);

    const rows: AbsenceRow[] = enrollments.map((e) => {
      const raw = e.attendance?.note?.trim() || null;
      const automatic = !!raw?.startsWith(AUTO_NOTE_PREFIX);
      const s = e.tutoringSession;
      return {
        enrollmentId: e.id,
        sessionId: s.id,
        student: `${e.student.lastName} ${e.student.firstName}`,
        identification: e.student.identification,
        level: e.student.level.name,
        parallel: e.student.parallel.name,
        subject: s.subject.name,
        teacher: `${s.teacher.firstName} ${s.teacher.lastName}`,
        date: ymd(s.date),
        startTime: s.startTime,
        endTime: s.endTime,
        justified: e.status === EnrollmentStatus.JUSTIFIED,
        note: automatic ? null : raw,
        automatic,
      };
    });

    // Por estudiante, con el desglose por materia y docente (pedido 2026-11-25).
    const studentMap = new Map<
      string,
      {
        student: string;
        identification: string;
        course: string;
        absences: number;
        withNote: number;
        subjects: { subject: string; teacher: string; absences: number }[];
      }
    >();
    for (const r of rows) {
      const s = studentMap.get(r.identification) ?? {
        student: r.student,
        identification: r.identification,
        course: `${r.level} · ${r.parallel}`,
        absences: 0,
        withNote: 0,
        subjects: [],
      };
      s.absences++;
      if (r.note) s.withNote++;
      const subj = s.subjects.find((x) => x.subject === r.subject && x.teacher === r.teacher);
      if (subj) subj.absences++;
      else s.subjects.push({ subject: r.subject, teacher: r.teacher, absences: 1 });
      studentMap.set(r.identification, s);
    }
    const byStudent = [...studentMap.values()]
      .map((s) => ({ ...s, subjects: s.subjects.sort((a, b) => b.absences - a.absences || a.subject.localeCompare(b.subject, 'es')) }))
      .sort((a, b) => b.absences - a.absences || a.student.localeCompare(b.student, 'es'));
    return {
      rows,
      total: rows.length,
      students: byStudent.length,
      withNote: rows.filter((r) => r.note).length,
      automatic: rows.filter((r) => r.automatic).length,
      byStudent,
    };
  }

  async xlsx(filters: ReportFiltersDto): Promise<Buffer> {
    const data = await this.compute(filters);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistema DECE · UETS';
    const font = { name: 'Arial', size: 10 };
    const head = (ws: ExcelJS.Worksheet, row: number) => {
      ws.getRow(row).eachCell((c) => {
        c.font = { ...font, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6F5C' } };
      });
    };

    const s1 = wb.addWorksheet('Inasistencias', { views: [{ state: 'frozen', ySplit: 3 }] });
    s1.getCell('A1').value = 'Inasistencias de estudiantes a tutorías';
    s1.getCell('A1').font = { name: 'Arial', size: 14, bold: true };
    s1.getCell('A2').value = `Generado el ${ymd(new Date())} · Sistema DECE UETS`;
    s1.getCell('A2').font = { ...font, italic: true, color: { argb: 'FF5B665F' } };
    s1.addRow(['Fecha', 'Hora', 'Estudiante', 'Cédula', 'Curso', 'Paralelo', 'Materia', 'Docente', 'Estado', 'Observación del docente']);
    head(s1, 3);
    for (const r of data.rows) {
      const row = s1.addRow([
        r.date,
        `${r.startTime}–${r.endTime}`,
        r.student,
        r.identification,
        r.level,
        r.parallel,
        r.subject,
        r.teacher,
        r.justified ? 'Justificada' : 'Ausente',
        r.note ?? (r.automatic ? 'El docente no tomó lista' : 'Sin observación'),
      ]);
      row.font = font;
      if (!r.note) row.getCell(10).font = { ...font, italic: true, color: { argb: 'FF5B665F' } };
    }
    s1.columns = [
      { width: 12 }, { width: 13 }, { width: 38 }, { width: 13 }, { width: 40 }, { width: 9 }, { width: 34 }, { width: 34 },
      { width: 12 }, { width: 60 },
    ];
    s1.getColumn(10).alignment = { wrapText: true, vertical: 'top' };
    s1.autoFilter = { from: 'A3', to: 'J3' };

    const s2 = wb.addWorksheet('Por estudiante', { views: [{ state: 'frozen', ySplit: 1 }] });
    s2.addRow(['Estudiante', 'Cédula', 'Curso', 'Materias (docente)', 'Inasistencias', 'Con observación']);
    head(s2, 1);
    for (const s of data.byStudent) {
      s2.addRow([s.student, s.identification, s.course, fmtSubjects(s.subjects), s.absences, s.withNote]).font = font;
    }
    s2.columns = [{ width: 38 }, { width: 13 }, { width: 46 }, { width: 70 }, { width: 14 }, { width: 16 }];
    s2.getColumn(4).alignment = { wrapText: true, vertical: 'top' };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async pdf(filters: ReportFiltersDto): Promise<Buffer> {
    const data = await this.compute(filters);
    const { INK, SOFT, RED } = PDF_COLORS;
    const pdf = createPdfReport(
      'Inasistencias de estudiantes a tutorías',
      [dateRangeLabel(filters.from, filters.to), `Generado el ${ymd(new Date())}`],
      'Sistema DECE · Inasistencias de estudiantes',
    );
    pdf.kpis([
      ['Inasistencias', data.total, RED],
      ['Estudiantes', data.students, INK],
      ['Con observación del docente', data.withNote, INK],
      ['Sin lista (marcadas por el sistema)', data.automatic, SOFT],
    ]);
    if (!data.total) {
      pdf.section('No hay inasistencias con estos filtros.');
      return pdf.end();
    }
    pdf.section('Por estudiante');
    pdf.table(
      [
        { title: 'Estudiante', w: 0.22 },
        { title: 'Cédula', w: 0.09 },
        { title: 'Curso', w: 0.2 },
        { title: 'Materias (docente)', w: 0.31 },
        { title: 'Faltas', w: 0.08, align: 'center' },
        { title: 'Con observación', w: 0.1, align: 'center' },
      ],
      data.byStudent.map((s) => ({
        cells: [s.student, s.identification, s.course, fmtSubjects(s.subjects), String(s.absences), String(s.withNote)],
        colors: [undefined, SOFT, undefined, undefined, RED],
      })),
    );
    pdf.space(8);
    pdf.section(`Detalle (${data.total})`);
    pdf.table(
      [
        { title: 'Fecha', w: 0.08 },
        { title: 'Hora', w: 0.08 },
        { title: 'Estudiante', w: 0.18 },
        { title: 'Curso', w: 0.14 },
        { title: 'Materia', w: 0.14 },
        { title: 'Docente', w: 0.14 },
        { title: 'Observación del docente', w: 0.24 },
      ],
      data.rows.map((r) => ({
        cells: [
          r.date,
          `${r.startTime}–${r.endTime}`,
          r.student,
          `${r.level} · ${r.parallel}`,
          r.subject,
          r.teacher,
          (r.justified ? 'Justificada. ' : '') + (r.note ?? (r.automatic ? 'El docente no tomó lista' : 'Sin observación')),
        ],
        colors: [undefined, undefined, undefined, undefined, undefined, undefined, r.note ? INK : SOFT],
      })),
    );
    return pdf.end();
  }
}
