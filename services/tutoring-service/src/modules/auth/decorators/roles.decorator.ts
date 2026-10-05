import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restringe un endpoint a los roles dados. Sin este decorador, cualquier
 * usuario autenticado puede acceder (ver RolesGuard).
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
