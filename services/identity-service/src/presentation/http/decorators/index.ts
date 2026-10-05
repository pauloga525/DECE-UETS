import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '../../../domain/entities/user.entity';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
}

export const IS_PUBLIC_KEY = 'isPublic';
/** Salta la autenticación (login, configuración pública, JWKS, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Restringe el endpoint a los roles dados. Sin decorador: cualquier usuario autenticado. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser =>
    ctx.switchToHttp().getRequest().user,
);

export const AccessToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null =>
    extractBearer(ctx.switchToHttp().getRequest()),
);

export function extractBearer(req: { headers: Record<string, string | string[] | undefined> }) {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}
