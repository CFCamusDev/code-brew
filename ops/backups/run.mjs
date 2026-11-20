import { spawnSync } from 'node:child_process';
import { openSync, closeSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function settings(env) {
  if (!env.RESTIC_REPOSITORY || !env.RESTIC_PASSWORD_FILE) throw new Error('Falta configurar repositorio y archivo de contraseña Restic.');
  let remote = false;
  try {
    const url = new URL(env.RESTIC_REPOSITORY.slice(3));
    remote = env.RESTIC_REPOSITORY.startsWith('s3:') && url.protocol === 'https:' && !!url.hostname && url.pathname !== '/' && !url.username && !url.password && !url.search && !url.hash;
  } catch {}
  if (!remote && !(env.BACKUP_ALLOW_LOCAL_REPOSITORY === '1' && /^\/repository(?:\/|$)/.test(env.RESTIC_REPOSITORY))) throw new Error('Usa un repositorio S3 HTTPS externo; el modo local es solo para QA.');
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(env.BACKUP_HOST ?? '')) throw new Error('Define BACKUP_HOST estable para identificar esta base.');
  for (const name of ['PGHOST', 'PGUSER', 'PGDATABASE', 'PGPASSFILE']) if (!env[name]) throw new Error(`Falta ${name}.`);
  return { host: env.BACKUP_HOST, tag: 'codebrew-postgres' };
}

export function selectSnapshot(snapshots, now = Date.now(), requireFresh = true) {
  const snapshot = [...snapshots].sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0];
  if (!snapshot || !/^[a-f0-9]{64}$/.test(snapshot.id ?? '') || !Number.isFinite(Date.parse(snapshot.time))) throw new Error('No existe un snapshot válido para esta base.');
  const age = now - Date.parse(snapshot.time);
  if (requireFresh && (age > 86400000 || age < -300000)) throw new Error('El último respaldo excede 24 horas o tiene una fecha futura inválida.');
  return snapshot;
}

export function restoreDatabase(env) {
  if (!/^[a-z][a-z0-9_]{0,48}_restore$/.test(env.RESTORE_DATABASE ?? '')) throw new Error('RESTORE_DATABASE debe ser una base de ensayo terminada en _restore.');
  if (env.RESTORE_DATABASE === env.PGDATABASE) throw new Error('El destino debe ser diferente de la base origen.');
  return env.RESTORE_DATABASE;
}

export function run(action, env = process.env, execute = spawnSync) {
  const config = settings(env);
  const started = Date.now();
  function command(program, args, options = {}) {
    const result = execute(program, args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024, ...options });
    // No imprimir stderr: puede contener credenciales, SQL o datos del respaldo.
    if (result.error || result.status !== 0) throw new Error(`${program} falló; revisa conectividad, permisos y configuración privada (código ${result.status ?? 'inicio'}).`);
    return result.stdout ?? '';
  }
  const scope = ['--host', config.host, '--tag', config.tag];
  function snapshot(requireFresh) {
    const requested = env.SNAPSHOT_ID;
    if (requested && !/^[a-f0-9]{64}$/.test(requested)) throw new Error('SNAPSHOT_ID debe ser un identificador completo de 64 caracteres hexadecimales.');
    let snapshots;
    try { snapshots = JSON.parse(command('restic', ['snapshots', '--json', ...scope])); }
    catch { throw new Error('No se pudieron consultar los snapshots del repositorio.'); }
    if (!Array.isArray(snapshots)) throw new Error('El repositorio no devolvió una lista de snapshots.');
    return selectSnapshot(requested ? snapshots.filter(item => item.id === requested) : snapshots, Date.now(), requireFresh);
  }
  switch (action) {
    case 'init': command('restic', ['init']); break;
    case 'backup':
      command('restic', ['backup', ...scope, '--stdin-filename', 'database.dump', '--stdin-from-command', '--', 'pg_dump', '--format=custom', '--no-owner', '--no-acl', '--no-password']);
      // La retención solo se aplica después de un dump y upload correctos.
      command('restic', ['forget', ...scope, '--group-by', 'host,tags', '--keep-daily', '7', '--keep-weekly', '4', '--keep-monthly', '6', '--prune']);
      { const saved = snapshot(true); console.log(`[backups] snapshot ${saved.id}; fecha ${saved.time}`); }
      break;
    case 'verify':
      { const saved = snapshot(true); console.log(`[backups] snapshot ${saved.id}; fecha ${saved.time}`); }
      command('restic', ['check', '--read-data']);
      break;
    case 'restore': {
      const database = restoreDatabase(env);
      const target = { ...env, PGDATABASE: database };
      const count = command('psql', ['-X', '--no-password', '-At', '-v', 'ON_ERROR_STOP=1', '-c', "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%';"], { env: target }).trim();
      if (count !== '0') throw new Error('El destino no está vacío; no se restauró ni eliminó nada.');
      const selected = snapshot(false);
      const file = '/work/database.dump';
      const fd = openSync(file, 'wx', 0o600);
      try {
        command('restic', ['dump', selected.id, '/database.dump'], { encoding: null, stdio: ['ignore', fd, 'pipe'] });
        command('pg_restore', ['--list', file]);
        command('pg_restore', ['--dbname', database, '--no-password', '--no-owner', '--no-acl', '--single-transaction', '--exit-on-error', file], { env: target });
        command('psql', ['-X', '--no-password', '-v', 'ON_ERROR_STOP=1', '-c', 'ANALYZE;'], { env: target });
      } finally {
        try { closeSync(fd); } catch {}
        unlinkSync(file);
      }
      console.log(`[backups] restaurado snapshot ${selected.id}`);
      break;
    }
    default: throw new Error('Acción válida: init, backup, verify o restore.');
  }
  console.log(`[backups] ${action} correcto; duración ${((Date.now() - started) / 1000).toFixed(2)} s`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { run(process.argv[2]); } catch (error) { console.error(`[backups] ${error.message}`); process.exitCode = 1; }
}
