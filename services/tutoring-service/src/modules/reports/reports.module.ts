import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ScheduleComplianceService } from './schedule-compliance.service';
import { UnfulfilledReportService } from './unfulfilled.service';
import { AbsencesReportService } from './absences.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ScheduleComplianceService, UnfulfilledReportService, AbsencesReportService],
})
export class ReportsModule {}
