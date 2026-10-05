import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditLogQueryService } from './audit-log-query.service';
import { AuditController } from './audit.controller';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditLogService, AuditLogQueryService],
  exports: [AuditLogService],
})
export class AuditModule {}
