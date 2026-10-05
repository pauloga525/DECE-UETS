import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { AvailabilityRulesService } from './availability-rules.service';
import { AvailabilityGeneratorService } from './availability-generator.service';
import { CreateAvailabilityRuleDto, UpdateAvailabilityRuleDto } from './dto/availability-rule.dto';

const READ_ROLES = [UserRole.ADMIN, UserRole.PSYCHOLOGY_COORDINATOR, UserRole.PSYCHOLOGIST, UserRole.TEACHER];
const WRITE_ROLES = [UserRole.ADMIN, UserRole.TEACHER];

@ApiTags('availability')
@ApiBearerAuth()
@Controller('availability')
export class AvailabilityController {
  constructor(
    private rules: AvailabilityRulesService,
    private generator: AvailabilityGeneratorService,
  ) {}

  @Roles(...WRITE_ROLES)
  @Post('rules')
  @ApiOperation({
    summary: 'Registrar disponibilidad recurrente de un docente (Admin/Docente)',
    description: 'El rango debe ser múltiplo exacto de 40 minutos (regla 1).',
  })
  createRule(@Body() dto: CreateAvailabilityRuleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rules.create(dto, user);
  }

  @Roles(...READ_ROLES)
  @Get('rules')
  @ApiOperation({
    summary: 'Listar reglas de disponibilidad, filtradas por docente/período/asignación',
  })
  findRules(
    @Query('teacherId') teacherId?: string,
    @Query('academicPeriodId') academicPeriodId?: string,
    @Query('teacherAssignmentId') teacherAssignmentId?: string,
  ) {
    return this.rules.findAll({ teacherId, academicPeriodId, teacherAssignmentId });
  }

  @Roles(...WRITE_ROLES)
  @Patch('rules/:id')
  @ApiOperation({ summary: 'Activar/desactivar una regla de disponibilidad (Admin/Docente)' })
  updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateAvailabilityRuleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rules.update(id, dto, user);
  }

  @Roles(...READ_ROLES)
  @Get('rules/preview')
  @ApiOperation({
    summary: 'Previsualizar en cuántos bloques de 40 min se divide un rango, sin guardar nada',
  })
  preview(@Query('startTime') startTime: string, @Query('endTime') endTime: string) {
    return this.rules.preview(startTime, endTime);
  }

  @Roles(...WRITE_ROLES)
  @Post('generate')
  @ApiOperation({
    summary:
      'Disparar manualmente el worker que proyecta reglas en bloques AVAILABLE (Admin/Docente)',
    description:
      'Normalmente corre solo, a diario (cron). Este endpoint es útil para no esperarlo en desarrollo/QA.',
  })
  generate() {
    return this.generator.generateAll();
  }
}
