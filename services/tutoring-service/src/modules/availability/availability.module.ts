import { Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller';
import { AvailabilityRulesService } from './availability-rules.service';
import { AvailabilityGeneratorService } from './availability-generator.service';

@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityRulesService, AvailabilityGeneratorService],
  exports: [AvailabilityRulesService, AvailabilityGeneratorService],
})
export class AvailabilityModule {}
