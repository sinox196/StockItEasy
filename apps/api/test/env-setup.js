process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST || 'postgresql://stockiteasy:stockiteasy@localhost:5432/stockiteasy_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-0123456789';
process.env.RATE_LIMIT_PER_MINUTE = '100000';
process.env.AUTH_RATE_LIMIT_PER_MINUTE = '100000';
delete process.env.REDIS_URL;
delete process.env.SMTP_HOST;
delete process.env.AI_SERVICE_URL;
