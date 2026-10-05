import { User } from '../../domain/entities/user.entity';
import { DomainError } from '../../domain/errors';
import { AuthEventLog, TokenService, UserRepository } from '../../domain/ports';

/**
 * Resuelve un access token a su usuario vigente. Es la fuente de verdad para la
 * revocación: además de la firma y la expiración, compara contra la base (activo +
 * tokenVersion). Los demás microservicios lo consultan vía GET /auth/session.
 */
export class GetSession {
  constructor(
    private users: UserRepository,
    private tokens: TokenService,
  ) {}

  async execute(accessToken: string): Promise<User> {
    let claims;
    try {
      claims = await this.tokens.verify(accessToken);
    } catch {
      throw new DomainError('SESSION_INVALID');
    }
    const user = await this.users.findById(claims.sub);
    if (!user || !user.acceptsTokenVersion(claims.tv)) throw new DomainError('SESSION_INVALID');
    return user;
  }
}

/**
 * Cierra sesión revocando todos los tokens del usuario (un JWT sin estado no permite
 * revocar uno solo sin lista negra por token).
 */
export class Logout {
  constructor(
    private users: UserRepository,
    private events: AuthEventLog,
  ) {}

  async execute(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new DomainError('USER_NOT_FOUND');
    user.revokeSessions();
    await this.users.save(user);
    await this.events.record({ type: 'LOGOUT', userId, email: user.email });
  }
}
