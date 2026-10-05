import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { StudentsService } from './students.service';
import { CreateStudentDto, UpdateStudentDto } from './dto/student.dto';

const READ_ROLES = [UserRole.ADMIN, UserRole.PSYCHOLOGY_COORDINATOR, UserRole.PSYCHOLOGIST, UserRole.TEACHER];
const WRITE_ROLES = [UserRole.ADMIN, UserRole.PSYCHOLOGY_COORDINATOR, UserRole.PSYCHOLOGIST];
const DELETE_ROLES = [UserRole.ADMIN];

@ApiTags('students')
@ApiBearerAuth()
@Controller('students')
export class StudentsController {
  constructor(private students: StudentsService) {}

  @Roles(...WRITE_ROLES)
  @Post()
  @ApiOperation({ summary: 'Registrar un estudiante (Admin/DECE)' })
  create(@Body() dto: CreateStudentDto) {
    return this.students.create(dto);
  }

  @Roles(...READ_ROLES)
  @Get()
  @ApiOperation({ summary: 'Listar estudiantes, con búsqueda y filtros por nivel/paralelo' })
  findAll(
    @Query('levelId') levelId?: string,
    @Query('parallelId') parallelId?: string,
    @Query('search') search?: string,
    @Query('assignmentId') assignmentId?: string,
  ) {
    return this.students.findAll({ levelId, parallelId, search, assignmentId });
  }

  @Roles(...READ_ROLES)
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un estudiante por id' })
  findOne(@Param('id') id: string) {
    return this.students.findOne(id);
  }

  @Roles(...READ_ROLES)
  @Get(':id/history')
  @ApiOperation({
    summary: 'Historial cronológico de tutorías del estudiante, con asistencia (pantalla 16)',
  })
  history(@Param('id') id: string) {
    return this.students.history(id);
  }

  @Roles(...WRITE_ROLES)
  @Patch(':id')
  @ApiOperation({ summary: 'Editar datos de un estudiante (Admin/DECE)' })
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.students.update(id, dto);
  }

  @Roles(...DELETE_ROLES)
  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar un estudiante (Admin)',
    description: 'Solo si no tiene inscripciones ni lista de espera asociadas — si tiene, 409 (usar isActive en su lugar).',
  })
  remove(@Param('id') id: string) {
    return this.students.remove(id);
  }
}
