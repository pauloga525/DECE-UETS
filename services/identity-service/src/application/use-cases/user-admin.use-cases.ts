import { Role, UserView } from '../../domain/entities/user.entity';
import { DomainError } from '../../domain/errors';
import { AuthEventLog, UserRepository } from '../../domain/ports';
import { EmailPolicy, InstitutionalEmail } from '../../domain/value-objects/institutional-email';

export class ListUsers {
  constructor(private users: UserRepository) {}

  async execute(): Promise<UserView[]> {
    return (await this.users.findAll()).map((u) => u.toView());
  }
}

/**
 * Habilita una cuenta institucional para el sistema DECE. El usuario no tiene contraseña:
 * entra con su cuenta de Google, y en su primer login se vincula el "sub" de Google.
 */
export class CreateUser {
  constructor(
    private users: UserRepository,
    private events: AuthEventLog,
    private emailPolicy: EmailPolicy,
  ) {}

  async execute(
    input: { email: string; role: Role; fullName?: string | null },
    actorId: string,
  ): Promise<UserView> {
    const email = InstitutionalEmail.create(input.email, this.emailPolicy);
    if (await this.users.findByEmail(email.value)) throw new DomainError('USER_ALREADY_EXISTS');

    const user = await this.users.create({
      email: email.value,
      role: input.role,
      fullName: input.fullName?.trim() || null,
    });
    await this.events.record({
      type: 'USER_CREATED',
      userId: user.id,
      email: user.email,
      detail: { role: user.role, by: actorId },
    });
    return user.toView();
  }
}

export class UpdateUser {
  constructor(
    private users: UserRepository,
    private events: AuthEventLog,
  ) {}

  async execute(
    id: string,
    changes: { role?: Role; isActive?: boolean; fullName?: string | null },
    actorId: string,
  ): Promise<UserView> {
    const user = await this.users.findById(id);
    if (!user) throw new DomainError('USER_NOT_FOUND');

    // Evita que el único admin se deje fuera a sí mismo por error.
    const demotesSelf = changes.role !== undefined && changes.role !== 'ADMIN';
    if (id === actorId && (demotesSelf || changes.isActive === false)) {
      throw new DomainError('CANNOT_MODIFY_SELF');
    }

    // Nunca dejar el sistema sin un administrador (root) activo.
    const losesAdmin =
      user.role === 'ADMIN' &&
      user.isActive &&
      ((changes.role !== undefined && changes.role !== 'ADMIN') || changes.isActive === false);
    if (losesAdmin && (await this.users.countActiveAdmins()) <= 1) {
      throw new DomainError('LAST_ADMIN');
    }

    const before = user.toView();
    if (changes.role !== undefined) user.changeRole(changes.role);
    if (changes.isActive !== undefined) user.setActive(changes.isActive);
    if (changes.fullName !== undefined) user.rename(changes.fullName?.trim() || null);
    await this.users.save(user);

    await this.events.record({
      type: 'USER_UPDATED',
      userId: id,
      email: user.email,
      detail: {
        by: actorId,
        before: { role: before.role, isActive: before.isActive },
        after: { role: user.role, isActive: user.isActive },
      },
    });
    return user.toView();
  }
}
