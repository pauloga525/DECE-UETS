import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { DevLogin, ListDevLoginUsers, LoginWithGoogle } from './application/use-cases/login.use-cases';
import { GetSession, Logout } from './application/use-cases/session.use-cases';
import { CreateUser, ListUsers, UpdateUser } from './application/use-cases/user-admin.use-cases';
import {
  AUTH_EVENT_LOG,
  AuthEventLog,
  GOOGLE_IDENTITY_VERIFIER,
  GoogleIdentityVerifier,
  TOKEN_SERVICE,
  TokenService,
  USER_REPOSITORY,
  UserRepository,
} from './domain/ports';
import { APP_CONFIG, AppConfig, loadConfig } from './infrastructure/config/app-config';
import { GoogleIdTokenVerifier } from './infrastructure/google/google-id-token.verifier';
import { JoseTokenService } from './infrastructure/jwt/jose-token.service';
import { PrismaService } from './infrastructure/persistence/prisma.service';
import {
  PrismaAuthEventLog,
  PrismaUserRepository,
} from './infrastructure/persistence/prisma-user.repository';
import { AuthController } from './presentation/http/auth.controller';
import { DomainExceptionFilter } from './presentation/http/domain-exception.filter';
import { AccessTokenGuard, RolesGuard } from './presentation/http/guards/auth.guards';
import { UsersController } from './presentation/http/users.controller';
import { WellKnownController } from './presentation/http/well-known.controller';
import { InternalController } from './presentation/http/internal.controller';

/**
 * Raíz de composición (arquitectura limpia): el único lugar que conoce a la vez los casos
 * de uso y las implementaciones concretas. Los casos de uso son clases planas sin
 * decoradores de Nest — se construyen aquí inyectándoles los puertos.
 */
const loginDeps = [USER_REPOSITORY, AUTH_EVENT_LOG, TOKEN_SERVICE, APP_CONFIG];
type LoginDepsArgs = [UserRepository, AuthEventLog, TokenService, AppConfig];
const toLoginDeps = (...[users, events, tokens, cfg]: LoginDepsArgs) => ({
  users,
  events,
  tokens,
  emailPolicy: cfg.emailPolicy,
});

@Module({
  controllers: [AuthController, UsersController, WellKnownController, InternalController],
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    PrismaService,

    // Adaptadores de infraestructura → puertos del dominio
    {
      provide: USER_REPOSITORY,
      inject: [PrismaService],
      useFactory: (p: PrismaService) => new PrismaUserRepository(p),
    },
    {
      provide: AUTH_EVENT_LOG,
      inject: [PrismaService],
      useFactory: (p: PrismaService) => new PrismaAuthEventLog(p),
    },
    {
      provide: GOOGLE_IDENTITY_VERIFIER,
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => new GoogleIdTokenVerifier(cfg.googleClientId),
    },
    {
      provide: TOKEN_SERVICE,
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => JoseTokenService.create(cfg.jwt, cfg.isProduction),
    },

    // Casos de uso
    {
      provide: LoginWithGoogle,
      inject: [...loginDeps, GOOGLE_IDENTITY_VERIFIER],
      useFactory: (...[u, e, t, cfg, google]: [...LoginDepsArgs, GoogleIdentityVerifier]) =>
        new LoginWithGoogle(toLoginDeps(u, e, t, cfg), google),
    },
    {
      provide: DevLogin,
      inject: loginDeps,
      useFactory: (...args: LoginDepsArgs) => new DevLogin(toLoginDeps(...args), args[3].devLoginEnabled),
    },
    {
      provide: ListDevLoginUsers,
      inject: [USER_REPOSITORY, APP_CONFIG],
      useFactory: (u: UserRepository, cfg: AppConfig) => new ListDevLoginUsers(u, cfg.devLoginEnabled),
    },
    {
      provide: GetSession,
      inject: [USER_REPOSITORY, TOKEN_SERVICE],
      useFactory: (u: UserRepository, t: TokenService) => new GetSession(u, t),
    },
    {
      provide: Logout,
      inject: [USER_REPOSITORY, AUTH_EVENT_LOG],
      useFactory: (u: UserRepository, e: AuthEventLog) => new Logout(u, e),
    },
    {
      provide: ListUsers,
      inject: [USER_REPOSITORY],
      useFactory: (u: UserRepository) => new ListUsers(u),
    },
    {
      provide: CreateUser,
      inject: [USER_REPOSITORY, AUTH_EVENT_LOG, APP_CONFIG],
      useFactory: (u: UserRepository, e: AuthEventLog, cfg: AppConfig) =>
        new CreateUser(u, e, cfg.emailPolicy),
    },
    {
      provide: UpdateUser,
      inject: [USER_REPOSITORY, AUTH_EVENT_LOG],
      useFactory: (u: UserRepository, e: AuthEventLog) => new UpdateUser(u, e),
    },

    // Orden importa: primero autentica, luego autoriza por rol.
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule {}
