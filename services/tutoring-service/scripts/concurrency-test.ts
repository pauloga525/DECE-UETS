/**
 * Prueba de concurrencia real para el DoD de la Fase 2 (sección 10 del plan):
 * "dos peticiones simultáneas para el quinto cupo de un bloque nunca producen 6/5 —
 * una se acepta, la otra se rechaza de forma controlada."
 *
 * No es un test de Jest a propósito: dispara dos llamadas HTTP-equivalentes (a nivel de
 * servicio, dentro del mismo proceso) verdaderamente en paralelo contra una base de datos
 * real, para observar el comportamiento del SELECT ... FOR UPDATE bajo carga real, no mockeado.
 *
 * Uso: npm run test:concurrency  (requiere Postgres arriba y migrado)
 */
import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { EnrollmentReason, SessionStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TutoringSessionsService } from '../src/modules/tutoring/tutoring-sessions.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const sessions = app.get(TutoringSessionsService);

  console.log('Preparando datos de prueba…');

  const admin = await prisma.user.upsert({
    where: { email: 'concurrency-test@uets.edu.ec' },
    update: {},
    create: { id: randomUUID(), email: 'concurrency-test@uets.edu.ec', role: 'ADMIN' },
  });

  const period = await prisma.academicPeriod.create({
    data: {
      name: `CONC-TEST-${Date.now()}`,
      startDate: new Date(),
      endDate: new Date(Date.now() + 86400000 * 300),
    },
  });
  const level = await prisma.level.create({
    data: { name: 'Nivel prueba', order: 1, academicPeriodId: period.id },
  });
  const parallel = await prisma.parallel.create({ data: { name: 'A', levelId: level.id } });
  const subject = await prisma.subject.create({
    data: { name: 'Materia prueba', code: `CONC-${Date.now()}` },
  });
  const teacher = await prisma.teacher.create({
    data: { firstName: 'Test', lastName: 'Concurrencia', email: `conc-${Date.now()}@uets.edu.ec` },
  });
  const assignment = await prisma.teacherAssignment.create({
    data: {
      teacherId: teacher.id,
      subjectId: subject.id,
      levelId: level.id,
      academicPeriodId: period.id,
    },
  });

  const session = await prisma.tutoringSession.create({
    data: {
      teacherId: teacher.id,
      subjectId: subject.id,
      levelId: level.id,
      teacherAssignmentId: assignment.id,
      parallelId: parallel.id,
      academicPeriodId: period.id,
      date: new Date(),
      startTime: '08:00',
      endTime: '08:40',
      status: SessionStatus.SCHEDULED,
      capacity: 5,
    },
  });

  // 4 estudiantes ya inscritos — queda exactamente 1 cupo libre.
  const existingStudents = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      prisma.student.create({
        data: {
          firstName: `Existente${i}`,
          lastName: 'Prueba',
          identification: `CONC-EX-${Date.now()}-${i}`,
          levelId: level.id,
          parallelId: parallel.id,
        },
      }),
    ),
  );
  await prisma.tutoringEnrollment.createMany({
    data: existingStudents.map((s) => ({
      tutoringSessionId: session.id,
      studentId: s.id,
      reason: EnrollmentReason.OTHER,
      createdById: admin.id,
    })),
  });

  // Dos estudiantes distintos compitiendo por el último cupo.
  const [studentA, studentB] = await Promise.all([
    prisma.student.create({
      data: {
        firstName: 'Candidato',
        lastName: 'A',
        identification: `CONC-A-${Date.now()}`,
        levelId: level.id,
        parallelId: parallel.id,
      },
    }),
    prisma.student.create({
      data: {
        firstName: 'Candidato',
        lastName: 'B',
        identification: `CONC-B-${Date.now()}`,
        levelId: level.id,
        parallelId: parallel.id,
      },
    }),
  ]);

  console.log('Disparando 2 inscripciones simultáneas para el último cupo…');
  const [resultA, resultB] = await Promise.allSettled([
    sessions.addEnrollments(
      session.id,
      [{ studentId: studentA.id, reason: EnrollmentReason.OTHER }],
      { userId: admin.id, email: admin.email, role: admin.role },
    ),
    sessions.addEnrollments(
      session.id,
      [{ studentId: studentB.id, reason: EnrollmentReason.OTHER }],
      { userId: admin.id, email: admin.email, role: admin.role },
    ),
  ]);

  const outcomes = [resultA, resultB];
  const fulfilled = outcomes.filter((r) => r.status === 'fulfilled');
  const rejected = outcomes.filter((r) => r.status === 'rejected');

  const finalCount = await prisma.tutoringEnrollment.count({
    where: { tutoringSessionId: session.id },
  });

  console.log(
    `Resultado: ${fulfilled.length} aceptada(s), ${rejected.length} rechazada(s). Inscritos finales: ${finalCount}/5`,
  );

  const pass = fulfilled.length === 1 && rejected.length === 1 && finalCount === 5;

  if (!pass) {
    console.error(
      '❌ FALLÓ: se esperaba exactamente 1 aceptada, 1 rechazada y 5 inscritos finales.',
    );
  } else {
    console.log('✅ OK: el bloqueo pesimista evitó el 6/5 bajo concurrencia real.');
  }

  // Limpieza — no dejar datos de prueba en la base.
  await prisma.tutoringEnrollment.deleteMany({ where: { tutoringSessionId: session.id } });
  await prisma.tutoringSession.delete({ where: { id: session.id } });
  await prisma.student.deleteMany({
    where: { id: { in: [...existingStudents.map((s) => s.id), studentA.id, studentB.id] } },
  });
  await prisma.teacherAssignment.deleteMany({ where: { teacherId: teacher.id } });
  await prisma.teacher.delete({ where: { id: teacher.id } });
  await prisma.subject.delete({ where: { id: subject.id } });
  await prisma.parallel.delete({ where: { id: parallel.id } });
  await prisma.level.delete({ where: { id: level.id } });
  await prisma.academicPeriod.delete({ where: { id: period.id } });

  await app.close();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
