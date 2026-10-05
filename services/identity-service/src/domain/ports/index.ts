import { Role, User, UserProps } from '../entities/user.entity';

/**
 * Puertos del dominio (arquitectura limpia): interfaces que el núcleo necesita y que la
 * capa de infraestructura implementa. El dominio y la aplicación dependen solo de esto,
 * nunca de Prisma, Google o jose directamente.
 */

export interface NewUserData {
  email: string;
  role: Role;
  fullName?: string | null;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAll(): Promise<User[]>;
  countActiveAdmins(): Promise<number>;
  create(data: NewUserData): Promise<User>;
  save(user: User): Promise<void>;
}

export type AuthEventType = 'LOGIN' | 'LOGIN_REJECTED' | 'LOGOUT' | 'USER_CREATED' | 'USER_UPDATED';

export interface AuthEventLog {
  record(event: {
    type: AuthEventType;
    userId?: string | null;
    email?: string | null;
    detail?: Record<string, unknown>;
  }): Promise<void>;
}

/** Identidad ya verificada criptográficamente por Google. */
export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  /** Claim "hd": dominio de Google Workspace. Ausente en cuentas @gmail.com. */
  hostedDomain?: string;
  name?: string;
  picture?: string;
}

export interface GoogleIdentityVerifier {
  verify(idToken: string): Promise<GoogleIdentity>;
}

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: Role;
  tv: number;
}

export interface TokenService {
  issue(user: Pick<UserProps, 'id' | 'email' | 'role' | 'tokenVersion'>): Promise<{
    accessToken: string;
    expiresIn: string;
  }>;
  verify(token: string): Promise<AccessTokenClaims>;
}

// Tokens de inyección — la capa de composición (app.module.ts) los enlaza a implementaciones.
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const AUTH_EVENT_LOG = Symbol('AUTH_EVENT_LOG');
export const GOOGLE_IDENTITY_VERIFIER = Symbol('GOOGLE_IDENTITY_VERIFIER');
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
