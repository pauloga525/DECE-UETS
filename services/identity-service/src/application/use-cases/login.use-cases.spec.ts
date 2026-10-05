import { User, UserProps } from '../../domain/entities/user.entity';
import { DomainError } from '../../domain/errors';
import { AuthEventLog, GoogleIdentity, TokenService, UserRepository } from '../../domain/ports';
import { DevLogin, LoginWithGoogle } from './login.use-cases';

const emailPolicy = { allowedDomain: 'uets.edu.ec', blockedLocalSuffixes: ['.est'] };

function makeUser(overrides: Partial<UserProps> = {}) {
  return User.rehydrate({
    id: 'u1',
    email: 'dece@uets.edu.ec',
    fullName: null,
    pictureUrl: null,
    googleSub: null,
    role: 'PSYCHOLOGIST',
    isActive: true,
    tokenVersion: 0,
    lastLoginAt: null,
    createdAt: new Date(),
    ...overrides,
  });
}

function setup(stored: User | null, identity: Partial<GoogleIdentity> = {}) {
  const users: UserRepository = {
    findById: jest.fn(),
    findByEmail: jest.fn().mockResolvedValue(stored),
    findAll: jest.fn(),
    countActiveAdmins: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const events: AuthEventLog = { record: jest.fn() };
  const tokens: TokenService = {
    issue: jest.fn().mockResolvedValue({ accessToken: 'jwt', expiresIn: '8h' }),
    verify: jest.fn(),
  };
  const google = {
    verify: jest.fn().mockResolvedValue({
      sub: 'google-sub-1',
      email: 'dece@uets.edu.ec',
      emailVerified: true,
      hostedDomain: 'uets.edu.ec',
      name: 'Equipo DECE',
      ...identity,
    }),
  };
  const deps = { users, events, tokens, emailPolicy };
  return { deps, users, events, tokens, useCase: new LoginWithGoogle(deps, google) };
}

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as DomainError).code;
  }
  return null;
}

describe('LoginWithGoogle', () => {
  it('emite token para un usuario registrado y vincula su cuenta de Google', async () => {
    const user = makeUser();
    const { useCase, users } = setup(user);
    const result = await useCase.execute('id-token');
    expect(result.accessToken).toBe('jwt');
    expect(result.user.fullName).toBe('Equipo DECE');
    expect(user.toSnapshot().googleSub).toBe('google-sub-1');
    expect(users.save).toHaveBeenCalled();
  });

  it('rechaza cuentas sin claim hd del Workspace (ej. Gmail)', async () => {
    const { useCase, tokens } = setup(makeUser(), { hostedDomain: undefined, email: 'x@gmail.com' });
    expect(await codeOf(useCase.execute('t'))).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('rechaza cuentas de estudiante del mismo Workspace', async () => {
    const { useCase, events } = setup(null, { email: 'ana.ruiz.est@uets.edu.ec' });
    expect(await codeOf(useCase.execute('t'))).toBe('STUDENT_ACCOUNT_NOT_ALLOWED');
    expect(events.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LOGIN_REJECTED' }),
    );
  });

  it('rechaza correos no verificados', async () => {
    const { useCase } = setup(makeUser(), { emailVerified: false });
    expect(await codeOf(useCase.execute('t'))).toBe('EMAIL_NOT_VERIFIED');
  });

  it('rechaza personal no pre-registrado', async () => {
    const { useCase } = setup(null);
    expect(await codeOf(useCase.execute('t'))).toBe('USER_NOT_REGISTERED');
  });

  it('rechaza usuarios desactivados', async () => {
    const { useCase } = setup(makeUser({ isActive: false }));
    expect(await codeOf(useCase.execute('t'))).toBe('USER_INACTIVE');
  });

  it('rechaza una cuenta de Google distinta a la ya vinculada', async () => {
    const { useCase } = setup(makeUser({ googleSub: 'otro-sub' }));
    expect(await codeOf(useCase.execute('t'))).toBe('GOOGLE_ACCOUNT_MISMATCH');
  });
});

describe('DevLogin', () => {
  it('está deshabilitado salvo que se active explícitamente', async () => {
    const { deps } = setup(makeUser());
    expect(await codeOf(new DevLogin(deps, false).execute('dece@uets.edu.ec'))).toBe(
      'DEV_LOGIN_DISABLED',
    );
  });

  it('aplica las mismas reglas de dominio', async () => {
    const { deps } = setup(makeUser());
    expect(await codeOf(new DevLogin(deps, true).execute('a.est@uets.edu.ec'))).toBe(
      'STUDENT_ACCOUNT_NOT_ALLOWED',
    );
  });
});
