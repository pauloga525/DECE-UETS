/**
 * Datos de PRUEBA de representantes (pedido 2026-09-30: "por el momento crea datos de prueba",
 * los reales llegarán en un Excel). Crea un representante por cada estudiante activo que no
 * tenga ninguno.
 *
 * Los correos usan el dominio reservado ".test" (RFC 2606): no existe y ningún correo puede
 * entregarse ahí, así que es imposible escribirle por error a una familia real.
 *
 * Uso: npm run seed:test-guardians   (usa DATABASE_URL del .env)
 * Para quitarlos:  npm run seed:test-guardians -- --remove
 */
import { PrismaClient } from '@prisma/client';

const TEST_DOMAIN = 'ejemplo.test';
const FIRST = ['Ana', 'Luis', 'María', 'Jorge', 'Carmen', 'Pedro', 'Rosa', 'Diego', 'Lucía', 'Fernando'];
const RELATIONSHIPS = ['Madre', 'Padre', 'Madre', 'Padre', 'Abuela', 'Tío'];

async function main() {
  const prisma = new PrismaClient();
  try {
    if (process.argv.includes('--remove')) {
      const { count } = await prisma.guardian.deleteMany({ where: { email: { endsWith: `@${TEST_DOMAIN}` } } });
      console.log(`Representantes de prueba eliminados: ${count}`);
      return;
    }

    const students = await prisma.student.findMany({
      where: { isActive: true, guardians: { none: {} } },
      orderBy: { lastName: 'asc' },
    });
    let i = 0;
    for (const s of students) {
      const first = FIRST[i % FIRST.length];
      const relationship = RELATIONSHIPS[i % RELATIONSHIPS.length];
      const slug = s.identification.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const guardian = await prisma.guardian.create({
        data: {
          firstName: first,
          lastName: s.lastName,
          email: `representante.${slug}@${TEST_DOMAIN}`,
          phone: `09${String(10000000 + i).slice(-8)}`,
        },
      });
      await prisma.studentGuardian.create({
        data: { studentId: s.id, guardianId: guardian.id, relationship },
      });
      console.log(`  ${s.firstName} ${s.lastName} → ${first} ${s.lastName} (${relationship}) <${guardian.email}>`);
      i++;
    }
    console.log(`Representantes de prueba creados: ${students.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
