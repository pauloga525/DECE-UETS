import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GetSession } from '../../../application/use-cases/session.use-cases';
import { Role } from '../../../domain/entities/user.entity';
import { AuthenticatedUser, extractBearer, IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';

/** Autenticación global: todo endpoint exige un access token vigente salvo @Public(). */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private getSession: GetSession,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (isPublic(this.reflector, context)) return true;
    const req = context.switchToHttp().getRequest();
    const token = extractBearer(req);
    if (!token) throw new UnauthorizedException('Sesión inválida o expirada.');
    try {
      const user = await this.getSession.execute(token);
      const authenticated: AuthenticatedUser = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };
      req.user = authenticated;
      return true;
    } catch {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    if (isPublic(this.reflector, context)) return true;
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest().user as AuthenticatedUser | undefined;
    return !!user && roles.includes(user.role);
  }
}

function isPublic(reflector: Reflector, context: ExecutionContext) {
  return reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
}
