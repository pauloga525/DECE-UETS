import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ScheduleComplianceService } from './schedule-compliance.service';
import { UnfulfilledReportService } from './unfulfilled.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ScheduleComplianceService, UnfulfilledReportService],
})
export class ReportsModule {}
