import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * IDs fijos compartidos con el seed de tutoring-service: el id de usuario es la identidad
 * que viaja en el JWT ("sub") y cada microservicio lo usa como clave de su proyección local.
 */
export const SEED_USERS: { id: string; email: string; role: Role; fullName: string }[] = [
  { id: '00000000-0000-4000-8000-000000000001', email: 'admin@uets.edu.ec', role: 'ADMIN', fullName: 'Administrador' },
  { id: '00000000-0000-4000-8000-000000000002', email: 'dece@uets.edu.ec', role: 'PSYCHOLOGIST', fullName: 'Psicóloga de ejemplo' },
  { id: '00000000-0000-4000-8000-000000000003', email: 'carlos@uets.edu.ec', role: 'TEACHER', fullName: 'Carlos Andrade' },
];

async function main() {
  for (const u of SEED_USERS) {
    await prisma.user.upsert({ where: { email: u.email }, update: {}, create: u });
  }

  // Primer administrador real: tu cuenta de Google institucional. Sin esto, nadie podría
  // entrar con Google para habilitar al resto (las cuentas de ejemplo no existen en Workspace).
  const realAdmin = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (realAdmin) {
    await prisma.user.upsert({
      where: { email: realAdmin },
      update: { role: 'ADMIN', isActive: true },
      create: { email: realAdmin, role: 'ADMIN' },
    });
  }

  console.log('Seed de identidad completado:', [...SEED_USERS.map((u) => u.email), realAdmin].filter(Boolean));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
