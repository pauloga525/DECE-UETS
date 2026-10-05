import { Controller, HttpCode, HttpStatus, Post, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticar con email + contraseña y obtener un JWT' })
  @ApiResponse({
    status: 200,
    description: 'Login exitoso — devuelve accessToken y datos del usuario',
  })
  @ApiResponse({ status: 401, description: 'Usuario o contraseña incorrectos' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cerrar sesión — invalida todos los JWT ya emitidos para este usuario',
    description:
      'Requiere estar autenticado. Al ser JWT sin estado, no se puede revocar un único token: esto invalida todas las sesiones activas del usuario, no solo la que llamó al endpoint.',
  })
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user.userId);
  }
}
