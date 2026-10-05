import { DomainError } from '../errors';

export const ROLES = ['ADMIN', 'PSYCHOLOGY_COORDINATOR', 'PSYCHOLOGIST', 'TEACHER', 'ANIMATOR'] as const;
export type Role = (typeof ROLES)[number];

export interface UserProps {
  id: string;
  email: string;
  fullName: string | null;
  pictureUrl: string | null;
  googleSub: string | null;
  role: Role;
  isActive: boolean;
  tokenVersion: number;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface LoginProfile {
  googleSub?: string;
  fullName?: string | null;
  pictureUrl?: string | null;
}

/** Vista pública del usuario — lo que se devuelve a los clientes y a otros servicios. */
export interface UserView {
  id: string;
  email: string;
  fullName: string | null;
  pictureUrl: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export class User {
  private constructor(private props: UserProps) {}

  static rehydrate(props: UserProps): User {
    return new User({ ...props });
  }

  get id() {
    return this.props.id;
  }
  get email() {
    return this.props.email;
  }
  get role() {
    return this.props.role;
  }
  get isActive() {
    return this.props.isActive;
  }
  get tokenVersion() {
    return this.props.tokenVersion;
  }
  get fullName() {
    return this.props.fullName;
  }
  get pictureUrl() {
    return this.props.pictureUrl;
  }

  /**
   * Valida que el usuario pueda iniciar sesión con la identidad de Google dada.
   * Si ya tiene un "sub" de Google vinculado, debe coincidir.
   */
  assertCanLogin(googleSub?: string) {
    if (!this.props.isActive) throw new DomainError('USER_INACTIVE');
    if (googleSub && this.props.googleSub && this.props.googleSub !== googleSub) {
      throw new DomainError('GOOGLE_ACCOUNT_MISMATCH');
    }
  }

  recordLogin(profile: LoginProfile, now: Date) {
    if (profile.googleSub && !this.props.googleSub) this.props.googleSub = profile.googleSub;
    if (profile.fullName) this.props.fullName = profile.fullName;
    if (profile.pictureUrl) this.props.pictureUrl = profile.pictureUrl;
    this.props.lastLoginAt = now;
  }

  /** ¿El token con esta versión sigue siendo válido para este usuario? */
  acceptsTokenVersion(tv: number) {
    return this.props.isActive && this.props.tokenVersion === tv;
  }

  revokeSessions() {
    this.props.tokenVersion += 1;
  }

  changeRole(role: Role) {
    if (role === this.props.role) return;
    this.props.role = role;
    // Los tokens emitidos llevan el rol anterior en sus claims: se revocan.
    this.revokeSessions();
  }

  setActive(isActive: boolean) {
    if (isActive === this.props.isActive) return;
    this.props.isActive = isActive;
    if (!isActive) this.revokeSessions();
  }

  rename(fullName: string | null) {
    this.props.fullName = fullName;
  }

  toSnapshot(): UserProps {
    return { ...this.props };
  }

  toView(): UserView {
    const { id, email, fullName, pictureUrl, role, isActive, lastLoginAt, createdAt } = this.props;
    return { id, email, fullName, pictureUrl, role, isActive, lastLoginAt, createdAt };
  }
}
