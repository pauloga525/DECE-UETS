import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig } from './infrastructure/config/app-config';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.use(helmet());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  const doc = new DocumentBuilder()
    .setTitle('DECE · Notification Service')
    .setDescription('Correos (solo envío, desde noreply@uets.edu.ec) y notificaciones del sistema')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));

  await app.listen(config.port);
  const log = new Logger('notification-service');
  log.log(`Escuchando en :${config.port} — modo de correo: ${config.mail.mode}`);
  if (config.mail.forcedFrom) {
    log.warn(`MAIL_MODE=${config.mail.forcedFrom} ignorado: fuera de producción nunca se envían correos.`);
  }
  if (config.mail.mode === 'log') log.warn(`Correos simulados (NO se envían): se guardan en ${config.mail.logDir}/`);
  if (config.mail.mode === 'redirect') log.warn(`MAIL_MODE=redirect: todos los correos van a ${config.mail.redirectTo}`);
  if (!config.internalServiceToken) log.warn('INTERNAL_SERVICE_TOKEN vacío: no se aceptarán eventos.');
}
bootstrap();
