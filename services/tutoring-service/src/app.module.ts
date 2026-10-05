import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AcademicModule } from './modules/academic/academic.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { StudentsModule } from './modules/students/students.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { TutoringModule } from './modules/tutoring/tutoring.module';
import { ReportsModule } from './modules/reports/reports.module';
import { AnimatorModule } from './modules/animator/animator.module';
import { GuardiansModule } from './modules/guardians/guardians.module';
import { EventsModule } from './modules/events/events.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AuthModule,
    AcademicModule,
    TeachersModule,
    StudentsModule,
    AvailabilityModule,
    TutoringModule,
    ReportsModule,
    AnimatorModule,
    GuardiansModule,
    EventsModule,
  ],
  providers: [
    // Orden importa: primero autentica (JWT), luego autoriza (roles).
    // @Public() en un handler salta ambos guards — ver jwt-auth.guard.ts.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
