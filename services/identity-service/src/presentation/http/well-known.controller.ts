import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TOKEN_SERVICE } from '../../domain/ports';
import { JoseTokenService } from '../../infrastructure/jwt/jose-token.service';
import { Public } from './decorators';

@ApiTags('infra')
@Controller()
export class WellKnownController {
  constructor(@Inject(TOKEN_SERVICE) private tokens: JoseTokenService) {}

  @Public()
  @Get('.well-known/jwks.json')
  @ApiOperation({ summary: 'Clave pública para verificar los JWT emitidos por este servicio' })
  jwks() {
    return this.tokens.jwks;
  }

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'identity-service' };
  }
}
