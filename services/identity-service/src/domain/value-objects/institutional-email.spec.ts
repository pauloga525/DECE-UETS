import { DomainError } from '../errors';
import { InstitutionalEmail } from './institutional-email';

const policy = { allowedDomain: 'uets.edu.ec', blockedLocalSuffixes: ['.est'] };

function codeOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    return (e as DomainError).code;
  }
  return null;
}

describe('InstitutionalEmail', () => {
  it.each(['dece@uets.edu.ec', 'juan.perez@uets.edu.ec', '  Maria.Lopez@UETS.EDU.EC '])(
    'acepta cuentas del personal: %s',
    (email) => {
      expect(InstitutionalEmail.create(email, policy).value).toBe(email.trim().toLowerCase());
    },
  );

  it.each(['juan.perez.est@uets.edu.ec', 'JUAN.EST@uets.edu.ec', 'x.est@UETS.edu.ec'])(
    'rechaza cuentas de estudiante: %s',
    (email) => {
      expect(codeOf(() => InstitutionalEmail.create(email, policy))).toBe(
        'STUDENT_ACCOUNT_NOT_ALLOWED',
      );
    },
  );

  it.each([
    'alguien@gmail.com',
    'alguien@alumnos.uets.edu.ec',
    'alguien@uets.edu.ec.evil.com',
    'alguien@uets.edu',
    'alguien@xuets.edu.ec',
  ])('rechaza otros dominios: %s', (email) => {
    expect(codeOf(() => InstitutionalEmail.create(email, policy))).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
  });

  it.each(['', 'sin-arroba', 'a@b@uets.edu.ec', 'con espacio@uets.edu.ec'])(
    'rechaza formatos inválidos: "%s"',
    (email) => {
      expect(codeOf(() => InstitutionalEmail.create(email, policy))).toBe('INVALID_EMAIL');
    },
  );

  it('"est" sin punto no es cuenta de estudiante (ej. ernest@)', () => {
    expect(InstitutionalEmail.create('ernest@uets.edu.ec', policy).value).toBe('ernest@uets.edu.ec');
  });
});
