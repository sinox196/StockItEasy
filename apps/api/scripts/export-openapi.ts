/** Writes the OpenAPI document to docs/api/openapi.json. Boots the app without listening (needs DATABASE_URL reachable). */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';
import { configureApp, setupSwagger } from '../src/bootstrap';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  configureApp(app);
  const doc = setupSwagger(app);
  const out = join(__dirname, '../../../docs/api');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'openapi.json'), JSON.stringify(doc, null, 2));
  await app.close();
  console.log(`OpenAPI: ${Object.keys(doc.paths).length} paths written to docs/api/openapi.json`);
}

void main();
