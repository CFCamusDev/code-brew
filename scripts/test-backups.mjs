import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const id = `codebrew-backup-qa-${randomBytes(4).toString('hex')}`;
const scratch = mkdtempSync(join(tmpdir(), id));
const password = randomBytes(24).toString('hex');
const image = `${id}:test`;
const network = `${id}-net`;
const source = `${id}-db`;
const volume = `${id}-repo`;
function docker(args, capture = false, allowFailure = false) {
  const result = spawnSync('docker', args, { cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (!allowFailure && (result.error || result.status !== 0)) throw new Error(`Docker QA falló en ${args[0]} (código ${result.status}).`);
  return capture ? result : result.stdout;
}
const pg = (...args) => docker(['exec', source, 'psql', '-U', 'codebrew', '-d', 'codebrew', '-At', '-v', 'ON_ERROR_STOP=1', ...args], true).stdout.trim();
const backupArgs = ['run', '--rm', '--network', network, '--read-only', '--tmpfs', '/work:uid=70,gid=70,mode=0700,size=512m', '--tmpfs', '/tmp:uid=70,gid=70,mode=0700', '-v', `${volume}:/repository`, '-v', `${scratch}:/secrets:ro`, '-e', `PGHOST=${source}`, '-e', 'PGUSER=codebrew', '-e', 'PGDATABASE=codebrew', '-e', 'PGPASSFILE=/secrets/pgpass', '-e', 'RESTIC_REPOSITORY=/repository', '-e', 'RESTIC_PASSWORD_FILE=/secrets/password', '-e', 'RESTIC_CACHE_DIR=/work/cache', '-e', 'BACKUP_ALLOW_LOCAL_REPOSITORY=1', '-e', 'BACKUP_HOST=codebrew-qa'];
try {
  writeFileSync(join(scratch, 'password'), randomBytes(32).toString('hex'));
  writeFileSync(join(scratch, 'wrong-password'), randomBytes(32).toString('hex'));
  // libpq exige 0600; copiar dentro del contenedor para que se respete también en Windows.
  writeFileSync(join(scratch, 'pgpass'), `*:5432:*:codebrew:${password}\n`);
  // Solo fixtures aleatorios: el UID 70 debe poder leer el bind mount en Linux.
  // El pgpass usado por libpq se copia después a tmpfs y se restringe a 0600.
  chmodSync(scratch, 0o755);
  for (const name of ['password', 'wrong-password', 'pgpass']) chmodSync(join(scratch, name), 0o644);
  writeFileSync(join(scratch, 'empty.env'), '');
  const modelResult = spawnSync('docker', ['compose', '--env-file', join(scratch, 'empty.env'), '-f', 'ops/backups/compose.yml', 'config', '--format', 'json'], { cwd: root, env: { ...process.env, PGHOST: source, BACKUP_NETWORK: network, BACKUP_SECRETS_DIR: scratch, RESTIC_REPOSITORY: 's3:https://storage.example.test/bucket' }, encoding: 'utf8' });
  assert.equal(modelResult.status, 0);
  const model = JSON.parse(modelResult.stdout);
  assert.equal(model.services.backup.read_only, true);
  assert.equal(model.networks.database.external, true);
  assert.equal(model.services.backup.environment.PGPASSFILE, '/run/secrets/pgpass');
  assert.equal(model.services.backup.ports?.length ?? 0, 0);
  docker(['build', '-t', image, 'ops/backups']);
  docker(['network', 'create', network]);
  docker(['volume', 'create', volume]);
  docker(['run', '--rm', '--user', '0', '-v', `${volume}:/repository`, '--entrypoint', 'sh', image, '-c', 'chown 70:70 /repository']);
  docker(['run', '-d', '--name', source, '--network', network, '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_USER=codebrew', '-e', 'POSTGRES_DB=codebrew', '-p', '127.0.0.1::5432', 'postgres:17-alpine']);
  for (let i = 0; ; i++) {
    if (docker(['exec', source, 'pg_isready', '-U', 'codebrew'], true, true).status === 0) break;
    if (i === 60) throw new Error('PostgreSQL QA no arrancó.');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  // Imagen QA: pgpass privado en tmpfs, sin cambiar permisos del archivo del host.
  const wrapper = 'cp /secrets/pgpass /work/pgpass && chmod 600 /work/pgpass && export PGPASSFILE=/work/pgpass && exec node /opt/backups/run.mjs "$@"';
  backupArgs.push('--entrypoint', 'sh');
  const invoke = (action, extra = [], failure = false) => docker([...backupArgs, ...extra, image, '-c', wrapper, 'qa', action], true, failure);
  const port = docker(['port', source, '5432'], true).stdout.trim().split(':').at(-1);
  const dbEnv = { ...process.env, DATABASE_URL: `postgres://codebrew:${password}@127.0.0.1:${port}/codebrew` };
  for (const script of ['scripts/db/migrate.mjs', 'scripts/db/seed.mjs']) {
    const result = spawnSync(process.execPath, [script], { cwd: root, env: dbEnv, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Falló ${script} en la base QA.`);
  }
  pg('-c', "create table backup_qa_parent (id int primary key, name text not null); create table backup_qa_child (parent_id int references backup_qa_parent(id)); insert into backup_qa_parent values (1,'Café QA'); insert into backup_qa_child values (1);");
  pg('-c', 'create database codebrew_restore;');
  invoke('init');
  const saved = invoke('backup');
  assert.match(saved.stdout, /backup correcto/);
  assert.match(invoke('verify').stdout, /verify correcto/);
  const restored = invoke('restore', ['-e', 'RESTORE_DATABASE=codebrew_restore']);
  assert.match(restored.stdout, /duración [\d.]+ s/);
  const restoredValue = pg('-d', 'codebrew_restore', '-c', 'select name from backup_qa_parent;');
  assert.equal(restoredValue, 'Café QA');
  for (const query of ['select count(*) from products;', 'select count(*) from drizzle.__drizzle_migrations;', 'select count(*) from backup_qa_child;']) assert.equal(pg('-c', query), pg('-d', 'codebrew_restore', '-c', query));
  assert.notEqual(docker(['exec', source, 'psql', '-U', 'codebrew', '-d', 'codebrew_restore', '-v', 'ON_ERROR_STOP=1', '-c', 'insert into backup_qa_child values (999);'], true, true).status, 0);
  assert.notEqual(invoke('restore', ['-e', 'RESTORE_DATABASE=codebrew_restore'], true).status, 0);
  assert.notEqual(invoke('restore', ['-e', 'RESTORE_DATABASE=codebrew'], true).status, 0);
  assert.notEqual(invoke('verify', ['-e', 'RESTIC_PASSWORD_FILE=/secrets/wrong-password'], true).status, 0);
  pg('-c', 'create database empty_restore;');
  assert.notEqual(invoke('restore', ['-e', 'RESTORE_DATABASE=empty_restore', '-e', 'RESTIC_PASSWORD_FILE=/secrets/wrong-password'], true).status, 0);
  assert.equal(pg('-d', 'empty_restore', '-c', "select count(*) from pg_class where relnamespace='public'::regnamespace;"), '0');
  const before = docker([...backupArgs, '--entrypoint', 'restic', image, 'snapshots', '--json'], true).stdout;
  assert.notEqual(invoke('backup', ['-e', 'PGDATABASE=missing_database'], true).status, 0);
  const after = docker([...backupArgs, '--entrypoint', 'restic', image, 'snapshots', '--json'], true).stdout;
  assert.equal(after, before, 'Un pg_dump fallido no debe crear snapshots parciales');
  console.log(restored.stdout.trim());
  console.log('[backup-qa] dump cifrado, integridad, restauración de esquema/datos/FK, rechazos y ausencia de snapshots parciales correctos; almacenamiento externo real pendiente');
} finally {
  docker(['rm', '-f', '-v', source], true, true);
  docker(['volume', 'rm', volume], true, true);
  docker(['network', 'rm', network], true, true);
  docker(['image', 'rm', image], true, true);
  rmSync(scratch, { recursive: true, force: true });
}
