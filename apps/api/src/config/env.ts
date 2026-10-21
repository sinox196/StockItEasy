import { existsSync } from 'fs';
import { z } from 'zod';

/** Environment configuration, validated once at startup. See apps/api/.env.example. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32).default('dev-only-access-secret-change-me-0123456789'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:8081'),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('StockItEasy <no-reply@stockiteasy.local>'),
  AI_SERVICE_URL: z.string().url().optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(300),
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().default(20),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

function loadDotEnv() {
  // Local development convenience: read apps/api/.env (existing variables win).
  // Tests and containers configure the environment explicitly.
  if (process.env.NODE_ENV === 'test' || !existsSync('.env')) return;
  process.loadEnvFile('.env');
}

export function env(): Env {
  if (!cached) {
    loadDotEnv();
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.error('Invalid environment configuration', parsed.error.issues);
      throw new Error('Invalid environment configuration');
    }
    if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_ACCESS_SECRET.startsWith('dev-only')) {
      throw new Error('JWT_ACCESS_SECRET must be set in production');
    }
    cached = parsed.data;
  }
  return cached;
}

/** Test helper: drop the cached configuration. */
export function resetEnvCache() {
  cached = undefined;
}
