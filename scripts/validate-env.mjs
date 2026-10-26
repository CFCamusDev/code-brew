import { existsSync } from 'node:fs';
import { validateEnvironment } from './lib/validate-env.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
const errors = validateEnvironment(process.env);
if (errors.length) {
  for (const message of errors) console.error(`[config] ${message}`);
  process.exitCode = 1;
} else {
  console.log('[config] configuración válida');
}
