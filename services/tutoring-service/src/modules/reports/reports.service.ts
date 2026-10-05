import { Injectable } from '@nestjs/common';
import { AttendanceStatus, EnrollmentStatus, Prisma, SessionStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportFiltersDto } from './dto/report-filters.dto';

type SessionWithRelations = Prisma.TutoringSessionGetPayload<{
  include: {
    teacher: true;
    subject: true;
    level: true;
    enrollments: { include: { attendance: true; student: true } };
  };
}>;

const MONTH_NAMES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Base de todos los reportes: tutorías que realmente llegaron a programarse
   * (se excluye AVAILABLE — un bloque libre nunca ocurrido no es información de reporte).
   */
  private findSessions(filters: ReportFiltersDto): Promise<SessionWithRelations[]> {
    return this.prisma.tutoringSession.findMany({
      where: {
        status: { not: SessionStatus.AVAILABLE },
        academicPeriodId: filters.academicPeriodId,
        teacherId: filters.teacherId,
        subjectId: filters.subjectId,
        levelId: filters.levelId,
        // Filtro por curso = por el paralelo de los alumnos (una tutoría puede mezclar paralelos).
        enrollments: filters.parallelId ? { some: { student: { parallelId: filters.parallelId } } } : undefined,
        date: {
          gte: filters.from ? new Date(filters.from) : undefined,
          lte: filters.to ? new Date(filters.to) : undefined,
        },
      },
      include: {
        teacher: true,
        subject: true,
        level: true,
        // Con filtro de curso, solo cuentan los alumnos de ese curso.
        enrollments: {
          where: filters.parallelId ? { student: { parallelId: filters.parallelId } } : undefined,
          include: { attendance: true, student: true },
        },
      },
      orderBy: { date: 'asc' },
    });
  }

  async summary(filters: ReportFiltersDto) {
    const sessions = await this.findSessions(filters);

    const completed = sessions.filter((s) => s.status === SessionStatus.COMPLETED);
    const cancelled = sessions.filter((s) => s.status === SessionStatus.CANCELLED);
    const allAttendance = sessions.flatMap((s) =>
      s.enrollments.map((e) => e.attendance).filter(Boolean),
    );

    const present = allAttendance.filter((a) => a!.status === AttendanceStatus.PRESENT).length;
    const absent = allAttendance.filter((a) => a!.status === AttendanceStatus.ABSENT).length;
    const justified = allAttendance.filter((a) => a!.status === AttendanceStatus.JUSTIFIED).length;

    const subjectCounts = new Map<string, number>();
    for (const s of sessions) {
      subjectCounts.set(s.subject.name, (subjectCounts.get(s.subject.name) ?? 0) + 1);
    }
    const topSubject = [...subjectCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      totalSessions: sessions.length,
      completedSessions: completed.length,
      cancelledSessions: cancelled.length,
      studentsAttended: present,
      absences: absent,
      justified,
      topSubject: topSubject ? { name: topSubject[0], count: topSubject[1] } : null,
    };
  }

  async byMonth(filters: ReportFiltersDto) {
    const sessions = await this.findSessions(filters);
    const counts = new Map<string, number>();
    for (const s of sessions) {
      const d = new Date(s.date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => {
        const [, month] = key.split('-');
        return { month: key, label: MONTH_NAMES[Number(month) - 1], count };
      });
  }

  async bySubject(filters: ReportFiltersDto) {
    const sessions = await this.findSessions(filters);
    const counts = new Map<string, { name: string; count: number }>();
    for (const s of sessions) {
      const entry = counts.get(s.subject.id) ?? { name: s.subject.name, count: 0 };
      entry.count += 1;
      counts.set(s.subject.id, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }

  async byTeacher(filters: ReportFiltersDto) {
    const sessions = await this.findSessions(filters);
    const counts = new Map<string, { name: string; count: number }>();
    for (const s of sessions) {
      const name = `${s.teacher.firstName} ${s.teacher.lastName}`;
      const entry = counts.get(s.teacherId) ?? { name, count: 0 };
      entry.count += 1;
      counts.set(s.teacherId, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }

  async exportCsv(filters: ReportFiltersDto): Promise<string> {
    const sessions = await this.findSessions(filters);
    const header = [
      'fecha',
      'hora_inicio',
      'hora_fin',
      'docente',
      'materia',
      'nivel',
      'estado',
      'estudiante',
      'motivo',
      'asistencia',
    ];
    const rows: string[][] = [];
    for (const s of sessions) {
      const base = [
        s.date.toISOString().slice(0, 10),
        s.startTime,
        s.endTime,
        `${s.teacher.firstName} ${s.teacher.lastName}`,
        s.subject.name,
        s.level.name,
        s.status,
      ];
      if (s.enrollments.length === 0) {
        rows.push([...base, '', '', '']);
        continue;
      }
      for (const e of s.enrollments) {
        rows.push([
          ...base,
          `${e.student.firstName} ${e.student.lastName}`,
          e.reason,
          e.attendance?.status ?? e.status,
        ]);
      }
    }
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    return [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
  }

  /**
   * Registro de tutorías por alumno (pedido 2026-10-02): para cada alumno, cuántas tutorías
   * tuvo en el período por materia, y el total sumando todas las materias.
   * Cuenta inscripciones en tutorías programadas/realizadas (nunca las canceladas); con
   * count=attended, solo aquellas a las que el alumno asistió.
   */
  async studentRegistry(filters: ReportFiltersDto) {
    const enrollments = await this.prisma.tutoringEnrollment.findMany({
      where: {
        status: filters.count === 'attended' ? EnrollmentStatus.ATTENDED : { not: EnrollmentStatus.CANCELLED },
        student: filters.parallelId ? { parallelId: filters.parallelId } : undefined,
        tutoringSession: {
          status: { notIn: [SessionStatus.AVAILABLE, SessionStatus.CANCELLED] },
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
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            identification: true,
            level: { select: { name: true, order: true } },
            parallel: { select: { name: true } },
          },
        },
        tutoringSession: { select: { subject: { select: { name: true } } } },
      },
    });

    interface RegistryRow {
      studentId: string;
      name: string;
      identification: string;
      level: string;
      levelOrder: number;
      parallel: string;
      counts: Record<string, number>;
      total: number;
    }
    const subjects = new Set<string>();
    const byStudent = new Map<string, RegistryRow>();
    for (const e of enrollments) {
      const subject = e.tutoringSession.subject.name;
      subjects.add(subject);
      const st = e.student;
      const row = byStudent.get(st.id) ?? {
        studentId: st.id,
        name: `${st.lastName} ${st.firstName}`,
        identification: st.identification,
        level: st.level.name,
        levelOrder: st.level.order,
        parallel: st.parallel.name,
        counts: {},
        total: 0,
      };
      row.counts[subject] = (row.counts[subject] ?? 0) + 1;
      row.total++;
      byStudent.set(st.id, row);
    }

    const subjectList = [...subjects].sort((a, b) => a.localeCompare(b, 'es'));
    const rows = [...byStudent.values()].sort(
      (a, b) =>
        a.levelOrder - b.levelOrder ||
        a.level.localeCompare(b.level, 'es') ||
        a.parallel.localeCompare(b.parallel, 'es', { numeric: true }) ||
        a.name.localeCompare(b.name, 'es'),
    );
    const bySubject: Record<string, number> = Object.fromEntries(subjectList.map((s) => [s, 0]));
    for (const r of rows) for (const [k, v] of Object.entries(r.counts)) bySubject[k] += v;

    return {
      count: filters.count ?? 'scheduled',
      subjects: subjectList,
      rows: rows.map(({ levelOrder: _order, ...r }) => r),
      totals: { bySubject, total: rows.reduce((acc, r) => acc + r.total, 0), students: rows.length },
    };
  }

  /** El mismo registro en Excel (.xlsx): totales por fila y por columna como fórmulas. */
  async studentRegistryXlsx(filters: ReportFiltersDto): Promise<Buffer> {
    const data = await this.studentRegistry(filters);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistema DECE · UETS';
    const ws = wb.addWorksheet('Registro de tutorías', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }] });
    const font = { name: 'Arial', size: 10 };

    ws.getCell('A1').value = 'Registro de tutorías por alumno';
    ws.getCell('A1').font = { name: 'Arial', size: 14, bold: true };
    ws.getCell('A2').value =
      (data.count === 'attended' ? 'Tutorías a las que asistió' : 'Tutorías asignadas (sin canceladas)') +
      ` · Generado el ${new Date().toISOString().slice(0, 10)} · Sistema DECE UETS`;
    ws.getCell('A2').font = { ...font, italic: true, color: { argb: 'FF5B665F' } };

    const header = ['Alumno', 'Cédula', 'Nivel', 'Paralelo', ...data.subjects, 'Total'];
    const headerRow = ws.getRow(4);
    headerRow.values = header;
    headerRow.height = 30;
    headerRow.eachCell((c) => {
      c.font = { ...font, bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6F5C' } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    const firstData = 5;
    const firstSubjectCol = 5;
    const totalCol = header.length;
    const letter = (n: number) => ws.getColumn(n).letter;
    data.rows.forEach((r, i) => {
      const rowNum = firstData + i;
      const row = ws.getRow(rowNum);
      row.values = [r.name, r.identification, r.level, r.parallel, ...data.subjects.map((s) => r.counts[s] ?? 0)];
      row.getCell(totalCol).value = data.subjects.length
        ? { formula: `SUM(${letter(firstSubjectCol)}${rowNum}:${letter(totalCol - 1)}${rowNum})`, result: r.total }
        : 0;
      row.font = font;
    });

    const lastData = firstData + data.rows.length - 1;
    const totalRow = ws.getRow(lastData + 1);
    totalRow.getCell(1).value = `TOTAL (${data.rows.length} alumnos)`;
    for (let c = firstSubjectCol; c <= totalCol; c++) {
      const subject = data.subjects[c - firstSubjectCol];
      totalRow.getCell(c).value = data.rows.length
        ? {
            formula: `SUM(${letter(c)}${firstData}:${letter(c)}${lastData})`,
            result: subject ? data.totals.bySubject[subject] : data.totals.total,
          }
        : 0;
    }
    totalRow.font = { ...font, bold: true };
    totalRow.eachCell((c) => (c.border = { top: { style: 'thin' } }));

    ws.getColumn(1).width = 38;
    ws.getColumn(2).width = 13;
    ws.getColumn(3).width = 30;
    ws.getColumn(4).width = 9;
    for (let c = firstSubjectCol; c <= totalCol; c++) {
      ws.getColumn(c).width = Math.max(10, Math.min(18, (header[c - 1]?.length ?? 8) + 2));
      ws.getColumn(c).alignment = { horizontal: 'center' };
    }
    ws.getColumn(2).numFmt = '@';
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: totalCol } };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
