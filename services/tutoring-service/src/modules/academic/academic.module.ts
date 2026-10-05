import { Module } from '@nestjs/common';
import { AcademicController } from './academic.controller';
import { AcademicPeriodsService } from './academic-periods.service';
import { LevelsService } from './levels.service';
import { ParallelsService } from './parallels.service';
import { SubjectsService } from './subjects.service';

@Module({
  controllers: [AcademicController],
  providers: [AcademicPeriodsService, LevelsService, ParallelsService, SubjectsService],
  exports: [AcademicPeriodsService, LevelsService, ParallelsService, SubjectsService],
})
export class AcademicModule {}
