/**
 * Migración de datos única: copia los usuarios que ya existían en la base del sistema de
 * tutorías (cuando era monolito con login por contraseña) al identity-service,
 * CONSERVANDO SUS IDs — así las referencias existentes en tutorías (auditoría, docentes,
 * inscripciones creadas por...) siguen apuntando al mismo usuario.
 *
 * Uso:
 *   npm run import:tutoring-users   (lee DATABASE_URL de ../tutoring-service/.env)
 *   TUTORING_DATABASE_URL="postgresql://.../tutorias_dev?schema=public" npm run import:tutoring-users
 *
 * Idempotente: los correos que ya existen en identidad se omiten. El rol DECE antiguo se
 * importa como PSYCHOLOGIST. Los usuarios con rol STUDENT no se importan (los estudiantes no acceden al sistema).
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient, Role } from '@prisma/client';

/** Por defecto, la misma base que usa el tutoring-service en desarrollo (su .env). */
function tutoringDatabaseUrl(): string | undefined {
  if (process.env.TUTORING_DATABASE_URL) return process.env.TUTORING_DATABASE_URL;
  const envFile = join(__dirname, '..', '..', 'tutoring-service', '.env');
  if (!existsSync(envFile)) return undefined;
  const line = readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith('DATABASE_URL='));
  return line?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
}

const VALID_ROLES: Role[] = ['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST', 'TEACHER', 'ANIMATOR'];

async function main() {
  const sourceUrl = tutoringDatabaseUrl();
  if (!sourceUrl) throw new Error('Definí TUTORING_DATABASE_URL (base de datos de tutorías)');

  const source = new PrismaClient({ datasourceUrl: sourceUrl });
  const target = new PrismaClient();

  try {
    const rows = await source.$queryRaw<
      { id: string; email: string; role: string; isActive: boolean }[]
    >`SELECT id, email, role::text AS role, "isActive" FROM users`;

    let imported = 0;
    for (const row of rows) {
      const email = row.email.toLowerCase();
      // El rol genérico DECE del monolito se reemplazó por los roles de psicología.
      if (row.role === 'DECE') row.role = 'PSYCHOLOGIST';
      if (!VALID_ROLES.includes(row.role as Role)) {
        console.log(`  omitido (rol ${row.role}): ${email}`);
        continue;
      }
      if (email.endsWith('.est@uets.edu.ec') || !email.endsWith('@uets.edu.ec')) {
        console.log(`  omitido (correo no permitido): ${email}`);
        continue;
      }
      const exists = await target.user.findFirst({ where: { OR: [{ id: row.id }, { email }] } });
      if (exists) {
        console.log(`  ya existe: ${email}`);
        continue;
      }
      await target.user.create({
        data: { id: row.id, email, role: row.role as Role, isActive: row.isActive },
      });
      imported++;
      console.log(`  importado: ${email} (${row.role})`);
    }
    console.log(`Listo: ${imported} usuario(s) importado(s) de ${rows.length}.`);
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
