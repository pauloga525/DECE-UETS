import { DeceDirectory } from '../../application/ports';
import { DeceMember } from '../../domain/tutoring-event';

const CACHE_MS = 5 * 60_000;

/** Equipo DECE desde el identity-service (endpoint interno, secreto compartido). */
export class IdentityDeceDirectory implements DeceDirectory {
  private cache: { members: DeceMember[]; at: number } | null = null;

  constructor(
    private baseUrl: string,
    private token: string | null,
  ) {}

  async members(): Promise<DeceMember[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.members;
    const res = await fetch(`${this.baseUrl}/api/internal/users?roles=PSYCHOLOGY_COORDINATOR,PSYCHOLOGIST`, {
      headers: { 'x-internal-token': this.token ?? '' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`identity-service respondió ${res.status} al pedir el equipo DECE`);
    const members = (await res.json()) as DeceMember[];
    this.cache = { members, at: Date.now() };
    return members;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  role: string;
}

/** Resuelve el usuario de un access token (introspección en identity), con caché corta. */
export class IdentitySessionClient {
  private cache = new Map<string, { user: SessionUser; exp: number }>();

  constructor(private baseUrl: string) {}

  async resolve(token: string): Promise<SessionUser | null> {
    const hit = this.cache.get(token);
    if (hit && hit.exp > Date.now()) return hit.user;
    const res = await fetch(`${this.baseUrl}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const u = (await res.json()) as SessionUser;
    const user = { id: u.id, email: u.email, role: u.role };
    if (this.cache.size > 1000) this.cache.clear();
    this.cache.set(token, { user, exp: Date.now() + 30_000 });
    return user;
  }
}
