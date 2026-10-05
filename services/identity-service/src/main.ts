import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig } from './infrastructure/config/app-config';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  // Sin CORS: el servicio es interno. Los navegadores llegan a través del API Gateway.
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const doc = new DocumentBuilder()
    .setTitle('DECE · Identity Service')
    .setDescription('Login con Google institucional (@uets.edu.ec), usuarios y roles, emisión de JWT (RS256)')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));

  await app.listen(config.port);

  const log = new Logger('identity-service');
  log.log(`Escuchando en :${config.port}`);
  if (!config.googleClientId) log.warn('GOOGLE_CLIENT_ID no configurado: el login con Google está deshabilitado.');
  if (config.devLoginEnabled) log.warn('DEV_LOGIN_ENABLED activo — login sin Google habilitado (solo desarrollo).');
}
bootstrap();

