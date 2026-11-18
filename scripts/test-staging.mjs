import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { validateEnvironment } from './lib/validate-env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'codebrew-staging-qa-'));
const project = `codebrew-stage-qa-${randomBytes(4).toString('hex')}`;
const deploymentId = `smoke-${randomBytes(8).toString('hex')}`;
const environment = {
  ...process.env,
  POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
  STAGING_SITE_URL: 'https://staging.coffeecodebrew.com',
  STAGING_BIND_ADDRESS: '127.0.0.1', STAGING_PORT: '8026',
  CULQI_PUBLIC_KEY: 'pk_test_stagingSmokeA1', CULQI_SECRET_KEY: 'sk_test_stagingSmokeB1',
  CULQI_WEBHOOK_SECRET: randomBytes(32).toString('hex'), CULQI_WEBHOOK_SECRET_PREVIOUS: '',
  STAGING_CRON_SECRET: randomBytes(32).toString('hex'), STAGING_DEPLOYMENT_ID: deploymentId,
  STAGING_RESEND_API_KEY: '', STAGING_EMAIL_FROM: '', STAGING_ADMIN_EMAIL: '', STAGING_SENTRY_DSN: '',
  STAGING_CLOUDINARY_CLOUD_NAME: '', STAGING_CLOUDINARY_API_KEY: '', STAGING_CLOUDINARY_API_SECRET: '',
  CATALOG_SOURCE: 'db', PUBLIC_ANALYTICS_ENV: 'disabled'
};
const envFile = join(scratch, '.env');
const override = join(scratch, 'qa.yml');
writeFileSync(envFile, '');
writeFileSync(override, `services:
  codebrew-landing:
    container_name: ${project}-web
    ports: !override
      - "127.0.0.1::80"
  codebrew-app:
    container_name: ${project}-app
  codebrew-db:
    container_name: ${project}-db
volumes:
  codebrew-db-data:
    name: ${project}-db-data
networks:
  default:
    name: ${project}-network
`);
const compose = ['compose', '--env-file', envFile, '--project-name', project, '-f', 'docker-compose.yml', '-f', 'docker-compose.staging.yml'];
function run(args, capture = false, useOverride = true) {
  const result = spawnSync('docker', [...compose, ...(useOverride ? ['-f', override] : []), ...args], { cwd: root, env: environment, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Falló Docker durante ${args[0]}.`);
  return result.stdout ?? '';
}
try {
  const model = JSON.parse(run(['config', '--format', 'json'], true, false));
  assert.deepEqual(Object.values(model.services).map(service => service.container_name).sort(), ['codebrew-staging-app', 'codebrew-staging-db', 'codebrew-staging-web']);
  assert.equal(model.volumes['codebrew-db-data'].name, 'codebrew-staging-db-data');
  assert.equal(model.networks.default.name, 'codebrew-staging');
  assert.equal(model.services['codebrew-landing'].ports.length, 1);
  assert.equal(model.services['codebrew-landing'].ports[0].host_ip, '127.0.0.1');
  assert.equal(String(model.services['codebrew-landing'].ports[0].published), '8026');
  assert.equal(model.services['codebrew-app'].build.args.PUBLIC_ANALYTICS_ENV, 'disabled');
  assert.equal(model.services['codebrew-db'].ports?.length ?? 0, 0);
  const appEnv = model.services['codebrew-app'].environment;
  assert.equal(appEnv.APP_ENV, 'staging');
  assert.equal(appEnv.PAYMENT_GATEWAY, 'culqi');
  assert.equal(appEnv.RESEND_API_KEY, '');
  assert.deepEqual(validateEnvironment(appEnv), []);
  assert(validateEnvironment({ ...appEnv, CULQI_PUBLIC_KEY: 'pk_live_notAllowed1', CULQI_SECRET_KEY: 'sk_live_notAllowed1' }).some(error => error.includes('APP_ENV=staging')));
  assert(validateEnvironment({ ...appEnv, PAYMENT_GATEWAY: 'fake' }).some(error => error.includes('no se permite')));
  run(['build']);
  run(['up', '-d', '--wait', '--wait-timeout', '240', 'codebrew-landing']);
  const address = run(['port', 'codebrew-landing', '80'], true).trim();
  const response = await fetch(`http://${address}/api/health`, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.environment, 'staging');
  assert.equal(health.deploymentId, deploymentId);
  assert.equal(health.database, 'ok');
  assert.equal(health.migrations, 'ok');
  run(['exec', '-T', 'codebrew-app', 'node', 'scripts/validate-env.mjs']);
  console.log('[staging-qa] aislamiento, arranque y configuración correctos; no se ejecutó un pago en Culqi');
} catch (error) {
  console.error(`[staging-qa] ${error.message}`);
  process.exitCode = 1;
  spawnSync('docker', [...compose, '-f', override, 'logs', '--tail', '30'], { cwd: root, env: environment, stdio: 'inherit' });
} finally {
  try { run(['down', '--volumes', '--remove-orphans']); } catch { process.exitCode = 1; }
  rmSync(scratch, { recursive: true, force: true });
}
