import { ForbiddenException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/authenticated-user';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Ficha de docente del usuario autenticado. Normalmente vinculada por userId (IdentityClient
 * la enlaza en el primer login); el correo es el respaldo si todavía no se vinculó.
 */
export function findTeacherOfUser(db: Db, user: AuthenticatedUser) {
  return db.teacher.findFirst({
    where: { OR: [{ userId: user.userId }, { email: user.email.toLowerCase() }] },
  });
}

/**
 * Un docente solo puede operar sobre sus propias tutorías y bloques (pedido 7/9/2026: "el
 * docente no puede asignar tutorías a otros docentes"). Admin y equipo de psicología no
 * tienen esta restricción.
 */
export async function assertActsOnOwnTeacher(db: Db, user: AuthenticatedUser, teacherId: string) {
  if (user.role !== UserRole.TEACHER) return;
  const own = await findTeacherOfUser(db, user);
  if (!own || own.id !== teacherId) {
    throw new ForbiddenException('Solo puedes gestionar tus propias tutorías.');
  }
}
