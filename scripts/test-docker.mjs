import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'codebrew-qa-'));
const project = `codebrew-qa-${randomBytes(4).toString('hex')}`;
const envFile = join(scratch, '.env');
const environment = {
  ...process.env,
  POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
  CULQI_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
  CULQI_WEBHOOK_SECRET_PREVIOUS: randomBytes(32).toString('hex'),
  CRON_SECRET: randomBytes(32).toString('hex'),
  CULQI_PUBLIC_KEY: '',
  CULQI_SECRET_KEY: '',
  RESEND_API_KEY: '',
  EMAIL_FROM: '',
  ADMIN_EMAIL: '',
  SITE_URL: 'http://localhost',
  PUBLIC_ANALYTICS_ENV: 'disabled',
  PUBLIC_GA4_ID: '',
  PORT: '8025'
};
writeFileSync(envFile, '', { mode: 0o600 });
const compose = ['compose', '--env-file', envFile, '--project-name', project, '-f', 'docker-compose.yml', '-f', 'docker-compose.test.yml'];
const keep = process.argv.includes('--keep');

function run(args) {
  const result = spawnSync('docker', [...compose, ...args], { cwd: root, env: environment, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Docker terminó con código ${result.status}: ${args[0]}`);
}

try {
  console.log(`[qa] proyecto aislado: ${project}`);
  run(['config', '--quiet']);
  run(['build']);
  run(['up', '-d', '--wait', '--wait-timeout', '180', 'codebrew-landing']);
  run(['run', '--rm', '--no-deps', 'tests']);
  console.log('[qa] compilación, salud, tipos, migraciones y pruebas correctas');
} catch (error) {
  console.error(`[qa] ${error instanceof Error ? error.message : 'La validación falló'}`);
  spawnSync('docker', [...compose, 'logs', '--tail', '60', 'codebrew-app', 'codebrew-landing'], { cwd: root, env: environment, stdio: 'inherit' });
  process.exitCode = 1;
} finally {
  if (keep) {
    console.log(`[qa] contenedores conservados para diagnóstico: ${project}`);
  } else {
    try {
      run(['down', '--volumes', '--remove-orphans']);
    } catch {
      process.exitCode = 1;
      console.error(`[qa] no se pudo limpiar el proyecto ${project}`);
    }
  }
  rmSync(scratch, { recursive: true });
}
