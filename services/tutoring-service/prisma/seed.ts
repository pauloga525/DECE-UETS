import { PrismaClient, UserRole, DayOfWeek } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_USER_IDS = {
  admin: '00000000-0000-4000-8000-000000000001',
  dece: '00000000-0000-4000-8000-000000000002',
  carlos: '00000000-0000-4000-8000-000000000003',
};

async function main() {
  // Proyección local de los usuarios del identity-service — mismos ids fijos que
  // services/identity-service/prisma/seed.ts. Sin contraseñas: el login es con Google.
  const admin = await prisma.user.upsert({
    where: { email: 'admin@uets.edu.ec' },
    update: {},
    create: { id: SEED_USER_IDS.admin, email: 'admin@uets.edu.ec', role: UserRole.ADMIN },
  });

  const deceUser = await prisma.user.upsert({
    where: { email: 'dece@uets.edu.ec' },
    update: {},
    create: { id: SEED_USER_IDS.dece, email: 'dece@uets.edu.ec', role: UserRole.PSYCHOLOGIST },
  });

  const period = await prisma.academicPeriod.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: '2026-2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-07-15'),
      isActive: true,
    },
  });

  const levelNames = [
    '8.º EGB',
    '9.º EGB',
    '10.º EGB',
    '1.º Bachillerato',
    '2.º Bachillerato',
    '3.º Bachillerato',
  ];
  const levels = [];
  for (let i = 0; i < levelNames.length; i++) {
    const level = await prisma.level.upsert({
      where: { academicPeriodId_name: { academicPeriodId: period.id, name: levelNames[i] } },
      update: {},
      create: { name: levelNames[i], order: i + 1, academicPeriodId: period.id },
    });
    levels.push(level);
    for (const parallelName of ['A', 'B']) {
      await prisma.parallel.upsert({
        where: { levelId_name: { levelId: level.id, name: parallelName } },
        update: {},
        create: { name: parallelName, levelId: level.id },
      });
    }
  }

  const level9 = levels[1];

  const matematicas = await prisma.subject.upsert({
    where: { code: 'MAT' },
    update: {},
    create: { name: 'Matemáticas', code: 'MAT' },
  });
  const sociales = await prisma.subject.upsert({
    where: { code: 'SOC' },
    update: {},
    create: { name: 'Estudios Sociales', code: 'SOC' },
  });

  // Docente de ejemplo de la sección 3 del plan: Carlos, Matemáticas 8-9-10 + Sociales 10-1BGU-2BGU.
  const carlosUser = await prisma.user.upsert({
    where: { email: 'carlos@uets.edu.ec' },
    update: {},
    create: { id: SEED_USER_IDS.carlos, email: 'carlos@uets.edu.ec', role: UserRole.TEACHER },
  });
  const carlos = await prisma.teacher.upsert({
    where: { email: 'carlos@uets.edu.ec' },
    update: {},
    create: {
      firstName: 'Carlos',
      lastName: 'Andrade',
      email: 'carlos@uets.edu.ec',
      userId: carlosUser.id,
    },
  });

  let mathAssignmentLevel9;
  for (const level of [levels[0], levels[1], levels[2]]) {
    const assignment = await prisma.teacherAssignment.upsert({
      where: {
        teacherId_subjectId_levelId_academicPeriodId: {
          teacherId: carlos.id,
          subjectId: matematicas.id,
          levelId: level.id,
          academicPeriodId: period.id,
        },
      },
      update: {},
      create: {
        teacherId: carlos.id,
        subjectId: matematicas.id,
        levelId: level.id,
        academicPeriodId: period.id,
      },
    });
    if (level.id === level9.id) mathAssignmentLevel9 = assignment;
  }
  for (const level of [levels[2], levels[3], levels[4]]) {
    await prisma.teacherAssignment.upsert({
      where: {
        teacherId_subjectId_levelId_academicPeriodId: {
          teacherId: carlos.id,
          subjectId: sociales.id,
          levelId: level.id,
          academicPeriodId: period.id,
        },
      },
      update: {},
      create: {
        teacherId: carlos.id,
        subjectId: sociales.id,
        levelId: level.id,
        academicPeriodId: period.id,
      },
    });
  }

  // El horario cuelga de la asignación (Matemáticas · 9.º EGB), no del docente en general —
  // Carlos declararía un horario aparte para cada una de sus otras combinaciones.
  if (!mathAssignmentLevel9) throw new Error('No se encontró la asignación Matemáticas · 9.º EGB');
  await prisma.teacherAvailabilityRule.create({
    data: {
      teacherAssignmentId: mathAssignmentLevel9.id,
      dayOfWeek: DayOfWeek.TUESDAY,
      startTime: '08:00',
      endTime: '10:40',
    },
  });

  const parallelsOf9 = await prisma.parallel.findMany({ where: { levelId: level9.id } });
  await prisma.student.upsert({
    where: { identification: '1700000001' },
    update: {},
    create: {
      firstName: 'María',
      lastName: 'Pérez',
      identification: '1700000001',
      levelId: level9.id,
      parallelId: parallelsOf9[0].id,
    },
  });

  console.log('Seed completado:', {
    admin: admin.email,
    dece: deceUser.email,
    teacher: carlos.email,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
