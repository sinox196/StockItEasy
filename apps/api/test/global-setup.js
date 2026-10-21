const { execSync } = require('child_process');
const path = require('path');

/** Applies migrations to the test database once before the suite. */
module.exports = async () => {
  const url = process.env.DATABASE_URL_TEST || 'postgresql://stockiteasy:stockiteasy@localhost:5432/stockiteasy_test?schema=public';
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'yes' },
    stdio: 'inherit',
  });
};
