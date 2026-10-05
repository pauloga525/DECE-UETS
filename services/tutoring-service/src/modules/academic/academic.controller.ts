import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { AcademicPeriodsService } from './academic-periods.service';
import { LevelsService } from './levels.service';
import { ParallelsService } from './parallels.service';
import { SubjectsService } from './subjects.service';
import { CreateAcademicPeriodDto, UpdateAcademicPeriodDto } from './dto/academic-period.dto';
import { CreateLevelDto, UpdateLevelDto } from './dto/level.dto';
import { CreateParallelDto, UpdateParallelDto } from './dto/parallel.dto';
import { CreateSubjectDto, UpdateSubjectDto } from './dto/subject.dto';

const READ_ROLES = [UserRole.ADMIN, UserRole.PSYCHOLOGY_COORDINATOR, UserRole.PSYCHOLOGIST, UserRole.TEACHER];
const WRITE_ROLES = [UserRole.ADMIN];

@ApiTags('academic')
@ApiBearerAuth()
@Controller('academic')
export class AcademicController {
  constructor(
    private periods: AcademicPeriodsService,
    private levels: LevelsService,
    private parallels: ParallelsService,
    private subjects: SubjectsService,
  ) {}

  // ── Períodos académicos ──────────────────────────────────────────
  @Roles(...WRITE_ROLES)
  @Post('periods')
  @ApiOperation({ summary: 'Crear un período académico (Admin)' })
  createPeriod(@Body() dto: CreateAcademicPeriodDto) {
    return this.periods.create(dto);
  }

  @Roles(...READ_ROLES)
  @Get('periods')
  @ApiOperation({ summary: 'Listar períodos académicos' })
  findPeriods() {
    return this.periods.findAll();
  }

  @Roles(...READ_ROLES)
  @Get('periods/:id')
  @ApiOperation({ summary: 'Obtener un período académico por id' })
  findPeriod(@Param('id') id: string) {
    return this.periods.findOne(id);
  }

  @Roles(...WRITE_ROLES)
  @Patch('periods/:id')
  @ApiOperation({ summary: 'Editar un período académico (Admin)' })
  updatePeriod(@Param('id') id: string, @Body() dto: UpdateAcademicPeriodDto) {
    return this.periods.update(id, dto);
  }

  // ── Niveles ───────────────────────────────────────────────────────
  @Roles(...WRITE_ROLES)
  @Post('levels')
  @ApiOperation({ summary: 'Crear un nivel dentro de un período (Admin)' })
  createLevel(@Body() dto: CreateLevelDto) {
    return this.levels.create(dto);
  }

  @Roles(...READ_ROLES)
  @Get('levels')
  @ApiOperation({ summary: 'Listar niveles, opcionalmente filtrados por período' })
  findLevels(@Query('academicPeriodId') academicPeriodId?: string) {
    return this.levels.findAll(academicPeriodId);
  }

  @Roles(...READ_ROLES)
  @Get('levels/:id')
  @ApiOperation({ summary: 'Obtener un nivel por id (incluye sus paralelos)' })
  findLevel(@Param('id') id: string) {
    return this.levels.findOne(id);
  }

  @Roles(...WRITE_ROLES)
  @Patch('levels/:id')
  @ApiOperation({ summary: 'Editar un nivel (Admin)' })
  updateLevel(@Param('id') id: string, @Body() dto: UpdateLevelDto) {
    return this.levels.update(id, dto);
  }

  // ── Paralelos ─────────────────────────────────────────────────────
  @Roles(...WRITE_ROLES)
  @Post('parallels')
  @ApiOperation({ summary: 'Crear un paralelo dentro de un nivel (Admin)' })
  createParallel(@Body() dto: CreateParallelDto) {
    return this.parallels.create(dto);
  }

  @Roles(...READ_ROLES)
  @Get('parallels')
  @ApiOperation({ summary: 'Listar paralelos, opcionalmente filtrados por nivel' })
  findParallels(@Query('levelId') levelId?: string) {
    return this.parallels.findAll(levelId);
  }

  @Roles(...WRITE_ROLES)
  @Patch('parallels/:id')
  @ApiOperation({ summary: 'Editar un paralelo (Admin)' })
  updateParallel(@Param('id') id: string, @Body() dto: UpdateParallelDto) {
    return this.parallels.update(id, dto);
  }

  // ── Materias ──────────────────────────────────────────────────────
  @Roles(...WRITE_ROLES)
  @Post('subjects')
  @ApiOperation({ summary: 'Crear una materia (Admin)' })
  createSubject(@Body() dto: CreateSubjectDto) {
    return this.subjects.create(dto);
  }

  @Roles(...READ_ROLES)
  @Get('subjects')
  @ApiOperation({ summary: 'Listar materias' })
  findSubjects() {
    return this.subjects.findAll();
  }

  @Roles(...WRITE_ROLES)
  @Patch('subjects/:id')
  @ApiOperation({ summary: 'Editar una materia, ej. activar/desactivar (Admin)' })
  updateSubject(@Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return this.subjects.update(id, dto);
  }
}
