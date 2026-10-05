import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/authenticated-user';

/** Cursos (paralelos) de los que el usuario es animador — asignados por correo. */
export function findAnimatorParallels(prisma: PrismaService, user: AuthenticatedUser) {
  return prisma.parallel.findMany({
    where: { animatorEmail: user.email.toLowerCase(), isActive: true },
    include: { level: { include: { academicPeriod: true } } },
    orderBy: [{ level: { order: 'asc' } }, { name: 'asc' }],
  });
}

/**
 * El animador solo ve su curso (pedido 2026-09-30). Devuelve el paralelo permitido:
 * el pedido si es suyo, o el primero de los suyos si no pidió ninguno.
 */
export async function resolveAnimatorParallel(
  prisma: PrismaService,
  user: AuthenticatedUser,
  requestedParallelId?: string,
): Promise<string> {
  const own = await findAnimatorParallels(prisma, user);
  if (own.length === 0) {
    throw new ForbiddenException('No tienes un curso asignado como animador. Contacta al administrador.');
  }
  if (!requestedParallelId) return own[0].id;
  if (!own.some((p) => p.id === requestedParallelId)) {
    throw new ForbiddenException('Solo puedes consultar el curso que tienes asignado.');
  }
  return requestedParallelId;
}

/**
 * Roles cuyo acceso a reportes se limita a sus cursos de animador. Desde la carga de docentes
 * (2026-10-05) el animador suele ser un DOCENTE con un paralelo asignado (Parallel.animatorEmail):
 * ser animador lo da el curso asignado, no el rol. El rol ANIMATOR queda para quien anima un
 * curso sin dictar materias.
 */
export function isAnimator(user: AuthenticatedUser) {
  return user.role === UserRole.ANIMATOR || user.role === UserRole.TEACHER;
}
