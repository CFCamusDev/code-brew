import { defineConfig } from 'vitest/config';

// Pruebas de integración: hablan por HTTP con un servidor ya levantado (INTEGRATION_BASE_URL)
// y preparan datos directo en PostgreSQL (DATABASE_URL). Corren en serie porque comparten la base.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['tests/integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000
  }
});
