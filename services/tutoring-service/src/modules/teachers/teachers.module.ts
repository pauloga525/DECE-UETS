import { Module } from '@nestjs/common';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';
import { TeacherAssignmentsService } from './teacher-assignments.service';

@Module({
  controllers: [TeachersController],
  providers: [TeachersService, TeacherAssignmentsService],
  exports: [TeachersService, TeacherAssignmentsService],
})
export class TeachersModule {}
