import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DayOfWeek, Prisma, SessionStatus, TeacherAvailabilityRule } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TUTORING_CAPACITY } from '../../common/tutoring.constants';
import { splitIntoBlocks } from '../../common/time.util';

const JS_DAY_TO_ENUM: DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

// Horizonte de proyección hacia adelante. Se corre a diario para mantenerlo siempre
// relleno "mes a mes" (sección 7 del plan) sin depender de que el cron no se pierda un día.
const HORIZON_DAYS = 35;

type RuleWithAssignment = TeacherAvailabilityRule & {
  teacherAssignment: {
    teacherId: string;
    subjectId: string;
    levelId: string;
    academicPeriodId: string;
    academicPeriod: { startDate: Date; endDate: Date };
  };
};

/**
 * Traduce TeacherAvailabilityRule (el patrón declarado por el docente para una asignación
 * materia+nivel concreta) en TutoringSession concretas de 40 minutos en estado AVAILABLE,
 * ya con materia y nivel puestos — el DECE ya no los elige al agendar. Nunca toca sesiones
 * ya SCHEDULED/COMPLETED/etc. — createMany + skipDuplicates se apoya en
 * @@unique([teacherId, date, startTime]) del schema para que reejecutar el generador sea
 * idempotente.
 */
@Injectable()
export class AvailabilityGeneratorService {
  private readonly logger = new Logger(AvailabilityGeneratorService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleCron() {
    const result = await this.generateAll();
    this.logger.log(`Proyección de disponibilidad: ${result.created} bloques nuevos`);
  }

  async generateAll(horizonDays = HORIZON_DAYS) {
    const rules = await this.prisma.teacherAvailabilityRule.findMany({
      where: {
        isActive: true,
        teacherAssignment: { isActive: true, academicPeriod: { isActive: true } },
      },
      include: { teacherAssignment: { include: { academicPeriod: true } } },
    });

    let created = 0;
    for (const rule of rules) {
      created += await this.generateForRule(rule, horizonDays);
    }
    return { created, rulesProcessed: rules.length };
  }

  async generateForRule(rule: RuleWithAssignment, horizonDays = HORIZON_DAYS) {
    const dates = this.datesMatchingRule(rule, horizonDays);
    if (dates.length === 0) return 0;

    const blocks = splitIntoBlocks(rule.startTime, rule.endTime);
    const rows: Prisma.TutoringSessionCreateManyInput[] = [];
    for (const date of dates) {
      for (const block of blocks) {
        rows.push({
          teacherId: rule.teacherAssignment.teacherId,
          subjectId: rule.teacherAssignment.subjectId,
          levelId: rule.teacherAssignment.levelId,
          teacherAssignmentId: rule.teacherAssignmentId,
          academicPeriodId: rule.teacherAssignment.academicPeriodId,
          availabilityRuleId: rule.id,
          date,
          startTime: block.startTime,
          endTime: block.endTime,
          status: SessionStatus.AVAILABLE,
          capacity: TUTORING_CAPACITY,
          location: rule.location, // el lugar lo declaró el docente en su horario
        });
      }
    }
    if (rows.length === 0) return 0;

    const result = await this.prisma.tutoringSession.createMany({
      data: rows,
      skipDuplicates: true,
    });
    return result.count;
  }

  private datesMatchingRule(
    rule: {
      dayOfWeek: DayOfWeek;
      teacherAssignment: { academicPeriod: { startDate: Date; endDate: Date } };
    },
    horizonDays: number,
  ): Date[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizonEnd = new Date(today);
    horizonEnd.setDate(horizonEnd.getDate() + horizonDays);

    const { academicPeriod } = rule.teacherAssignment;
    const rangeStart = new Date(Math.max(today.getTime(), academicPeriod.startDate.getTime()));
    const rangeEnd = new Date(Math.min(horizonEnd.getTime(), academicPeriod.endDate.getTime()));

    const dates: Date[] = [];
    for (const d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
      if (JS_DAY_TO_ENUM[d.getDay()] === rule.dayOfWeek) {
        dates.push(new Date(d));
      }
    }
    return dates;
  }
}
