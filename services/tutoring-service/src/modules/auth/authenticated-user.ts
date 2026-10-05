import { UserRole } from '@prisma/client';

/** Usuario autenticado tal como lo ven los controladores (request.user). */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
}
