import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DevLogin, ListDevLoginUsers, LoginWithGoogle } from '../../application/use-cases/login.use-cases';
import { GetSession, Logout } from '../../application/use-cases/session.use-cases';
import { APP_CONFIG, AppConfig } from '../../infrastructure/config/app-config';
import { AccessToken, AuthenticatedUser, CurrentUser, Public } from './decorators';
import { DevLoginDto, GoogleLoginDto } from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private config: AppConfig,
    private loginWithGoogle: LoginWithGoogle,
    private devLogin: DevLogin,
    private listDevLoginUsers: ListDevLoginUsers,
    private getSession: GetSession,
    private logoutUseCase: Logout,
  ) {}

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Configuración pública para la pantalla de login' })
  publicConfig() {
    return {
      googleClientId: this.config.googleClientId,
      allowedDomain: this.config.emailPolicy.allowedDomain,
      devLoginEnabled: this.config.devLoginEnabled,
    };
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión con Google',
    description:
      'Recibe el ID token de Google Identity Services. Solo cuentas @uets.edu.ec del Workspace institucional, verificadas, pre-registradas y activas. Las cuentas .est@uets.edu.ec se rechazan.',
  })
  google(@Body() dto: GoogleLoginDto) {
    return this.loginWithGoogle.execute(dto.credential);
  }

  @Public()
  @Post('dev-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login solo con correo — SOLO desarrollo (DEV_LOGIN_ENABLED=true, nunca en producción)',
  })
  dev(@Body() dto: DevLoginDto) {
    return this.devLogin.execute(dto.email);
  }

  @Public()
  @Get('dev-users')
  @ApiOperation({
    summary: 'Usuarios activos de la base de datos para el acceso de desarrollo — SOLO desarrollo',
  })
  devUsers() {
    return this.listDevLoginUsers.execute();
  }

  @Get('session')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Usuario de la sesión actual',
    description:
      'Valida firma, expiración y revocación (activo + tokenVersion). Los demás microservicios lo usan para introspección.',
  })
  async session(@AccessToken() token: string) {
    return (await this.getSession.execute(token)).toView();
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar sesión — revoca todos los tokens emitidos para el usuario' })
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.logoutUseCase.execute(user.userId);
    return { success: true };
  }
}
