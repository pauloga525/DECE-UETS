import { ROLES, UserView } from '../../domain/entities/user.entity';
import { DomainError } from '../../domain/errors';
import {
  AuthEventLog,
  GoogleIdentityVerifier,
  TokenService,
  UserRepository,
} from '../../domain/ports';
import { EmailPolicy, InstitutionalEmail } from '../../domain/value-objects/institutional-email';

export interface LoginResult {
  accessToken: string;
  expiresIn: string;
  user: UserView;
}

interface LoginDeps {
  users: UserRepository;
  events: AuthEventLog;
  tokens: TokenService;
  emailPolicy: EmailPolicy;
}

/**
 * Pasos comunes a todo login: validar correo institucional, exigir usuario pre-registrado
 * y activo, actualizar perfil, emitir el JWT. Los rechazos quedan en la bitácora.
 */
async function authenticate(
  deps: LoginDeps,
  rawEmail: string,
  profile: { googleSub?: string; fullName?: string; pictureUrl?: string },
  method: 'google' | 'dev',
): Promise<LoginResult> {
  try {
    const email = InstitutionalEmail.create(rawEmail, deps.emailPolicy);

    // Acceso por invitación: la cuenta debe existir (creada por un administrador).
    // Pertenecer al dominio no basta — no todo el personal debe ver casos del DECE.
    const user = await deps.users.findByEmail(email.value);
    if (!user) throw new DomainError('USER_NOT_REGISTERED');

    user.assertCanLogin(profile.googleSub);
    user.recordLogin(profile, new Date());
    await deps.users.save(user);

    const token = await deps.tokens.issue(user.toSnapshot());
    await deps.events.record({ type: 'LOGIN', userId: user.id, email: user.email, detail: { method } });
    return { ...token, user: user.toView() };
  } catch (e) {
    if (e instanceof DomainError) {
      await deps.events.record({
        type: 'LOGIN_REJECTED',
        email: rawEmail?.toLowerCase() ?? null,
        detail: { method, reason: e.code },
      });
    }
    throw e;
  }
}

export class LoginWithGoogle {
  constructor(
    private deps: LoginDeps,
    private google: GoogleIdentityVerifier,
  ) {}

  async execute(idToken: string): Promise<LoginResult> {
    const identity = await this.google.verify(idToken);

    if (!identity.emailVerified) throw new DomainError('EMAIL_NOT_VERIFIED');
    // Defensa adicional al chequeo del correo: el claim "hd" solo lo emite Google para
    // cuentas administradas por el Workspace de la institución (no para @gmail.com ni
    // cuentas personales que usen un alias con ese dominio).
    if (identity.hostedDomain?.toLowerCase() !== this.deps.emailPolicy.allowedDomain.toLowerCase()) {
      await this.deps.events.record({
        type: 'LOGIN_REJECTED',
        email: identity.email,
        detail: { method: 'google', reason: 'EMAIL_DOMAIN_NOT_ALLOWED', hd: identity.hostedDomain ?? null },
      });
      throw new DomainError('EMAIL_DOMAIN_NOT_ALLOWED');
    }

    return authenticate(
      this.deps,
      identity.email,
      { googleSub: identity.sub, fullName: identity.name, pictureUrl: identity.picture },
      'google',
    );
  }
}

/**
 * Login solo con correo, sin Google — exclusivamente para desarrollo local y pruebas
 * automatizadas. Aplica las mismas reglas de dominio y de registro. La composición
 * (app.module.ts) lo deshabilita siempre en producción.
 */
export class DevLogin {
  constructor(
    private deps: LoginDeps,
    private enabled: boolean,
  ) {}

  async execute(email: string): Promise<LoginResult> {
    if (!this.enabled) throw new DomainError('DEV_LOGIN_DISABLED');
    return authenticate(this.deps, email, {}, 'dev');
  }
}

/**
 * Usuarios activos registrados en la base de identidad, para el selector del acceso de
 * desarrollo. Mismo interruptor que DevLogin: nunca disponible en producción.
 */
export class ListDevLoginUsers {
  constructor(
    private users: UserRepository,
    private enabled: boolean,
  ) {}

  async execute(): Promise<Pick<UserView, 'email' | 'fullName' | 'role'>[]> {
    if (!this.enabled) throw new DomainError('DEV_LOGIN_DISABLED');
    return (await this.users.findAll())
      .filter((u) => u.isActive)
      .map((u) => ({ email: u.email, fullName: u.fullName, role: u.role }))
      .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.email.localeCompare(b.email));
  }
}
