import { describe, expect, it } from 'vitest';
import { settings, selectSnapshot, restoreDatabase, run } from '../../ops/backups/run.mjs';

const env = { RESTIC_REPOSITORY: 's3:https://storage.example.test/bucket/database', RESTIC_PASSWORD_FILE: '/private/password', BACKUP_HOST: 'codebrew-production', PGHOST: 'db', PGUSER: 'codebrew', PGDATABASE: 'codebrew', PGPASSFILE: '/private/pgpass' };
const now = Date.parse('2026-11-20T12:00:00Z');
const snapshot = { id: 'a'.repeat(64), time: new Date(now).toISOString() };
describe('respaldos PostgreSQL', () => {
  it('exige almacenamiento externo cifrado y configuración completa', () => {
    expect(settings(env).host).toBe('codebrew-production');
    expect(() => settings({ ...env, RESTIC_REPOSITORY: '/repository' })).toThrow('S3 HTTPS');
    expect(() => settings({ ...env, RESTIC_PASSWORD_FILE: '' })).toThrow('contraseña');
    expect(() => settings({ ...env, BACKUP_HOST: '' })).toThrow('BACKUP_HOST');
    expect(() => settings({ ...env, PGHOST: '' })).toThrow('PGHOST');
  });
  it('comprueba la copia más reciente, límite de 24 horas y reloj futuro', () => {
    expect(selectSnapshot([snapshot], now).id).toBe(snapshot.id);
    expect(selectSnapshot([{ ...snapshot, time: new Date(now - 86400000).toISOString() }], now)).toBeTruthy();
    expect(() => selectSnapshot([{ ...snapshot, time: new Date(now - 86400001).toISOString() }], now)).toThrow('24 horas');
    expect(() => selectSnapshot([{ ...snapshot, time: new Date(now + 300001).toISOString() }], now)).toThrow('futura');
    expect(() => selectSnapshot([], now)).toThrow('snapshot');
    expect(() => selectSnapshot([{ ...snapshot, id: 'latest' }], now)).toThrow('snapshot');
    expect(selectSnapshot([{ ...snapshot, time: '2020-01-01T00:00:00Z' }], now, false)).toBeTruthy();
  });
  it.each(['codebrew', 'postgres', 'codebrew-staging', 'x_restore;drop database codebrew', ''])('rechaza restaurar sobre %s', database => {
    expect(() => restoreDatabase({ ...env, RESTORE_DATABASE: database })).toThrow();
  });
  it('requiere un destino separado de ensayo', () => {
    expect(restoreDatabase({ ...env, RESTORE_DATABASE: 'codebrew_restore' })).toBe('codebrew_restore');
    expect(() => restoreDatabase({ ...env, PGDATABASE: 'codebrew_restore', RESTORE_DATABASE: 'codebrew_restore' })).toThrow('diferente');
  });
  it('si falla dump/upload no ejecuta retención ni anuncia éxito', () => {
    const calls: string[][] = [];
    const execute = (_: string, args: string[]) => { calls.push(args); return { status: 1, stderr: 'PRIVATE_TOKEN_AND_SQL' }; };
    expect(() => run('backup', env, execute as any)).toThrow('restic falló');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('--stdin-from-command');
    expect(calls[0]).toContain('pg_dump');
    expect(calls[0]).not.toContain('forget');
  });
  it('no descarga ni restaura sobre una base con objetos', () => {
    const calls: string[] = [];
    const execute = (program: string) => { calls.push(program); return { status: 0, stdout: '1\n' }; };
    expect(() => run('restore', { ...env, RESTORE_DATABASE: 'codebrew_restore' }, execute as any)).toThrow('no está vacío');
    expect(calls).toEqual(['psql']);
  });
  it('rechaza snapshots arbitrarios antes de acceder al repositorio', () => {
    expect(() => run('verify', { ...env, SNAPSHOT_ID: 'latest' }, (() => { throw new Error('no debe ejecutarse'); }) as any)).toThrow('SNAPSHOT_ID');
  });
});
