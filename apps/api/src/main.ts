import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './bootstrap';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  configureApp(app);
  if (env().NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') setupSwagger(app);
  app.enableShutdownHooks();
  await app.listen(env().PORT);
  Logger.log(`StockItEasy API listening on :${env().PORT} (docs: /api/docs)`, 'Bootstrap');
}

void bootstrap();
