import { OAuth2Client } from 'google-auth-library';
import { DomainError } from '../../domain/errors';
import { GoogleIdentity, GoogleIdentityVerifier } from '../../domain/ports';

/**
 * Verifica el ID token que entrega Google Identity Services en el navegador: firma (claves
 * públicas de Google), expiración, emisor y que el "aud" sea nuestro Client ID — un token
 * emitido para otra aplicación no sirve aquí.
 */
export class GoogleIdTokenVerifier implements GoogleIdentityVerifier {
  private client = new OAuth2Client();

  constructor(private clientId: string | null) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    if (!this.clientId) throw new DomainError('GOOGLE_NOT_CONFIGURED');

    let payload;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
      payload = ticket.getPayload();
    } catch {
      throw new DomainError('INVALID_GOOGLE_TOKEN');
    }
    if (!payload?.sub || !payload.email) throw new DomainError('INVALID_GOOGLE_TOKEN');

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      hostedDomain: payload.hd,
      name: payload.name,
      picture: payload.picture,
    };
  }
}
