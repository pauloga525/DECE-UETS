import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { generateKeyPairSync } from 'crypto';
import { join } from 'path';
import {
  calculateJwkThumbprint,
  exportJWK,
  importPKCS8,
  JWK,
  jwtVerify,
  KeyLike,
  SignJWT,
  createLocalJWKSet,
} from 'jose';
import { Role, ROLES } from '../../domain/entities/user.entity';
import { AccessTokenClaims, TokenService } from '../../domain/ports';
import { AppConfig } from '../config/app-config';

const ALG = 'RS256';

/**
 * JWT firmados con RS256. Solo este servicio tiene la clave privada; los demás
 * microservicios verifican con la clave pública publicada en /.well-known/jwks.json,
 * así que ninguno puede fabricar tokens aunque se comprometa.
 */
export class JoseTokenService implements TokenService {
  private constructor(
    private privateKey: KeyLike,
    private publicJwk: JWK,
    private cfg: AppConfig['jwt'],
  ) {}

  static async create(cfg: AppConfig['jwt'], isProduction: boolean): Promise<JoseTokenService> {
    const pem = cfg.privateKeyPem ?? loadOrCreateDevKey(isProduction);
    const privateKey = await importPKCS8(pem, ALG, { extractable: true });
    const full = await exportJWK(privateKey);
    // Solo la parte pública (n, e) — jamás publicar d, p, q, dp, dq, qi.
    const publicJwk: JWK = { kty: full.kty, n: full.n, e: full.e };
    publicJwk.kid = await calculateJwkThumbprint(publicJwk);
    publicJwk.alg = ALG;
    publicJwk.use = 'sig';
    return new JoseTokenService(privateKey, publicJwk, cfg);
  }

  get jwks() {
    return { keys: [this.publicJwk] };
  }

  async issue(user: { id: string; email: string; role: Role; tokenVersion: number }) {
    const accessToken = await new SignJWT({ email: user.email, role: user.role, tv: user.tokenVersion })
      .setProtectedHeader({ alg: ALG, kid: this.publicJwk.kid })
      .setSubject(user.id)
      .setIssuer(this.cfg.issuer)
      .setAudience(this.cfg.audience)
      .setIssuedAt()
      .setExpirationTime(this.cfg.expiresIn)
      .sign(this.privateKey);
    return { accessToken, expiresIn: this.cfg.expiresIn };
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    const { payload } = await jwtVerify(token, createLocalJWKSet(this.jwks), {
      issuer: this.cfg.issuer,
      audience: this.cfg.audience,
      algorithms: [ALG],
    });
    const role = payload.role as Role;
    if (!payload.sub || typeof payload.email !== 'string' || !ROLES.includes(role) || typeof payload.tv !== 'number') {
      throw new Error('Claims inválidos');
    }
    return { sub: payload.sub, email: payload.email, role, tv: payload.tv };
  }
}

/**
 * En desarrollo se genera un par de claves la primera vez y se guarda en .keys/ (ignorado
 * por git), para que los tokens sobrevivan a los reinicios del modo watch. En producción
 * la clave debe venir por JWT_PRIVATE_KEY: generarla al vuelo invalidaría todas las
 * sesiones en cada despliegue y no funcionaría con más de una réplica.
 */
function loadOrCreateDevKey(isProduction: boolean): string {
  if (isProduction) {
    throw new Error('JWT_PRIVATE_KEY es obligatoria en producción (ver docs/guia-despliegue.md)');
  }
  const dir = join(process.cwd(), '.keys');
  const file = join(dir, 'jwt-private.pem');
  if (existsSync(file)) return readFileSync(file, 'utf8');

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, pem, { mode: 0o600 });
  return pem;
}
