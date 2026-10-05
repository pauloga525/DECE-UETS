import { Role, User } from '../../domain/entities/user.entity';
import { DomainError } from '../../domain/errors';
import { AuthEventLog, UserRepository } from '../../domain/ports';
import { UpdateUser } from './user-admin.use-cases';

function makeUser(id: string, role: Role, isActive = true) {
  return User.rehydrate({
    id,
    email: `${id}@uets.edu.ec`,
    fullName: null,
    pictureUrl: null,
    googleSub: null,
    role,
    isActive,
    tokenVersion: 0,
    lastLoginAt: null,
    createdAt: new Date(),
  });
}

function setup(target: User, activeAdmins: number) {
  const users: UserRepository = {
    findById: jest.fn().mockResolvedValue(target),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
    countActiveAdmins: jest.fn().mockResolvedValue(activeAdmins),
    create: jest.fn(),
    save: jest.fn(),
  };
  const events: AuthEventLog = { record: jest.fn() };
  return { users, useCase: new UpdateUser(users, events) };
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as DomainError).code;
  }
  return null;
}

describe('UpdateUser — asignación de roles', () => {
  it('cambia el rol de psicólogo a coordinador y revoca sus sesiones', async () => {
    const target = makeUser('anait', 'PSYCHOLOGIST');
    const { useCase, users } = setup(target, 1);
    const view = await useCase.execute('anait', { role: 'PSYCHOLOGY_COORDINATOR' }, 'root');
    expect(view.role).toBe('PSYCHOLOGY_COORDINATOR');
    expect(target.tokenVersion).toBe(1);
    expect(users.save).toHaveBeenCalled();
  });

  it('impide quitar el rol al último administrador activo', async () => {
    const { useCase } = setup(makeUser('otro-admin', 'ADMIN'), 1);
    expect(await codeOf(useCase.execute('otro-admin', { role: 'TEACHER' }, 'root'))).toBe('LAST_ADMIN');
  });

  it('impide desactivar al último administrador activo', async () => {
    const { useCase } = setup(makeUser('otro-admin', 'ADMIN'), 1);
    expect(await codeOf(useCase.execute('otro-admin', { isActive: false }, 'root'))).toBe('LAST_ADMIN');
  });

  it('permite degradar a un admin si queda otro activo', async () => {
    const { useCase } = setup(makeUser('otro-admin', 'ADMIN'), 2);
    expect((await useCase.execute('otro-admin', { role: 'PSYCHOLOGIST' }, 'root')).role).toBe('PSYCHOLOGIST');
  });

  it('un admin no puede quitarse su propio rol', async () => {
    const { useCase } = setup(makeUser('root', 'ADMIN'), 3);
    expect(await codeOf(useCase.execute('root', { role: 'TEACHER' }, 'root'))).toBe('CANNOT_MODIFY_SELF');
  });
});
