import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './config/env';

/** Shared by main.ts and the e2e tests so both run the exact same HTTP stack. */
export function configureApp(app: INestApplication) {
  const e = env();
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: e.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id', 'Idempotency-Key', 'X-Request-Id', 'Accept-Language'],
    exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed'],
  });
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);
  return app;
}

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('StockItEasy API')
    .setDescription(
      'REST API v1. Authenticate with a bearer access token; tenant routes require the X-Organization-Id header. ' +
        'Errors return { statusCode, code, message, details } where code is a stable key (see errors.* in @stockiteasy/i18n). ' +
        'Send an Idempotency-Key header on writes that may be retried.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs/openapi.json' });
  return document;
}
