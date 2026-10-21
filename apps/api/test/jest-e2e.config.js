/** Integration tests: real NestJS app + real PostgreSQL (DATABASE_URL_TEST or the local stockiteasy_test DB). */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/global-setup.js',
  setupFiles: ['<rootDir>/test/env-setup.js'],
  testTimeout: 60000,
  maxWorkers: 1,
};
