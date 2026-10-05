import { Module } from '@nestjs/common';
import { TutoringController, EnrollmentsController } from './tutoring.controller';
import { TutoringSessionsService } from './tutoring-sessions.service';
import { AttendanceService } from './attendance.service';
import { WaitlistService } from './waitlist.service';
import { AutoCompleteWorker } from './auto-complete.worker';

@Module({
  controllers: [TutoringController, EnrollmentsController],
  providers: [TutoringSessionsService, AttendanceService, WaitlistService, AutoCompleteWorker],
  exports: [TutoringSessionsService, AttendanceService, WaitlistService],
})
export class TutoringModule {}
