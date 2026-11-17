// Stack local completo en Docker (S8.5): Nginx + app + PostgreSQL como en producción y, con --tunnel, un túnel de
// Cloudflare para el webhook de Culqi.
//   pnpm local:up [--tunnel]   construye y levanta (http://localhost:8080)
//   pnpm local:url             muestra la URL pública del túnel y la del webhook (sin la clave)
//   pnpm local:down [--volumes]  apaga; con --volumes borra también su base de datos
// Lee el .env del proyecto. La base de este stack es propia (no la de `pnpm db:up`).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [command = 'up', ...flags] = process.argv.slice(2);

if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));
const port = process.env.LOCAL_PORT || '8080';
const environment = {
  ...process.env,
  // Contraseña solo de este stack local; producción define la suya en Portainer.
  POSTGRES_PASSWORD: process.env.LOCAL_POSTGRES_PASSWORD || 'codebrew-local-solo-desarrollo',
  APP_ENV: 'local',
  PORT: port,
  SITE_URL: process.env.LOCAL_SITE_URL || `http://localhost:${port}`,
  SENTRY_ENVIRONMENT: 'local',
  PUBLIC_ANALYTICS_ENV: 'disabled'
};

// Un .env vacío para Compose: así solo usa los valores de `environment` y no vuelve a leer el .env del proyecto.
const scratch = mkdtempSync(join(tmpdir(), 'codebrew-local-'));
const envFile = join(scratch, '.env');
writeFileSync(envFile, '', { mode: 0o600 });
const tunnelProfile = environment.CLOUDFLARE_TUNNEL_TOKEN ? 'tunnel-fixed' : 'tunnel';
const compose = ['compose', '--env-file', envFile, '-f', 'docker-compose.yml', '-f', 'docker-compose.local.yml', '--profile', tunnelProfile];

function run(args, options = {}) {
  const result = spawnSync('docker', [...compose, ...args], { cwd: root, env: environment, stdio: options.capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) throw new Error(`Docker terminó con código ${result.status}: ${args.join(' ')}`);
  return result.stdout ?? '';
}

/** URL del túnel rápido según sus logs; null si no hay túnel rápido o aún no se registró. */
function quickTunnelUrl() {
  const logs = run(['logs', 'tunnel'], { capture: true, allowFailure: true });
  return logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] ?? null;
}

function printTunnel() {
  const url = tunnelProfile === 'tunnel-fixed' ? '(la dirección fija configurada en Cloudflare)' : quickTunnelUrl();
  if (!url) return console.log('[local] el túnel aún no tiene dirección; prueba de nuevo en unos segundos con `pnpm local:url`.');
  console.log(`[local] túnel: ${url}`);
  console.log(`[local] webhook para CulqiPanel (order.status.changed): ${url}/api/webhooks/culqi?key=<CULQI_WEBHOOK_SECRET de tu .env>`);
}

try {
  if (command === 'up') {
    const withTunnel = flags.includes('--tunnel');
    run(['config', '--quiet']);
    run(['build']);
    run(['up', '-d', '--wait', '--wait-timeout', '240', 'codebrew-landing']);
    console.log(`[local] tienda en http://localhost:${port} · panel en http://localhost:${port}/admin`);
    if (withTunnel) {
      run(['up', '-d', tunnelProfile]);
      // El túnel rápido tarda unos segundos en recibir su dirección.
      for (let attempt = 0; attempt < 15 && tunnelProfile === 'tunnel' && !quickTunnelUrl(); attempt++) {
        spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},2000)']);
      }
      printTunnel();
    }
  } else if (command === 'url') {
    printTunnel();
  } else if (command === 'down') {
    run(['down', '--remove-orphans', ...(flags.includes('--volumes') ? ['--volumes'] : [])]);
  } else if (command === 'logs') {
    run(['logs', '--tail', '80', ...flags]);
  } else {
    console.error('Uso: node scripts/local-stack.mjs up [--tunnel] | url | logs [servicio] | down [--volumes]');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`[local] ${error instanceof Error ? error.message : 'falló'}`);
  process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true });
}
