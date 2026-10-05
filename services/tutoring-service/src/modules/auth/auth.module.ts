import { Global, Module } from '@nestjs/common';
import { IdentityClient } from './identity-client';

/**
 * La autenticación vive en el identity-service. Este módulo solo expone el adaptador que
 * valida los tokens que él emite (usado por el guard global JwtAuthGuard).
 */
@Global()
@Module({
  providers: [IdentityClient],
  exports: [IdentityClient],
})
export class AuthModule {}
