import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditLogQueryService } from './audit-log-query.service';
import { AuditLogFiltersDto } from './dto/audit-log-filters.dto';

@ApiTags('audit')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private auditQuery: AuditLogQueryService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar el log de auditoría, paginado (Admin) — pantalla 25',
    description:
      'Solo lectura: audit_logs es insert-only a nivel de motor de base de datos (regla 15).',
  })
  findAll(@Query() filters: AuditLogFiltersDto) {
    return this.auditQuery.findAll(filters);
  }
}
