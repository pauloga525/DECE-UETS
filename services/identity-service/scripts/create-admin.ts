/**
 * Crea (o reactiva) un administrador de la plataforma DECE. Es la forma de dar el primer
 * acceso en un entorno nuevo: desde ahí, ese admin habilita al resto desde el portal
 * (Usuarios y roles). No hay contraseña — la persona entra con su cuenta de Google.
 *
 *   Desarrollo:  npm run create-admin -- nombre.apellido@uets.edu.ec
 *   Producción:  docker compose -f docker-compose.prod.yml run --rm identity-service \
 *                  node dist/scripts/create-admin.js nombre.apellido@uets.edu.ec
 */
import { PrismaClient } from '@prisma/client';
import { InstitutionalEmail } from '../src/domain/value-objects/institutional-email';
import { loadConfig } from '../src/infrastructure/config/app-config';

async function main() {
  const raw = process.argv[2];
  if (!raw) throw new Error('Uso: create-admin <correo@uets.edu.ec>');

  // Mismas reglas que el login: dominio exacto y sin cuentas de estudiante.
  const email = InstitutionalEmail.create(raw, loadConfig().emailPolicy).value;

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: { role: 'ADMIN', isActive: true, tokenVersion: { increment: 1 } },
      create: { email, role: 'ADMIN' },
    });
    console.log(`Administrador listo: ${user.email} (${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
