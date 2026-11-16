export interface HealthProbes {
  /** Una consulta trivial a la base; lanza si no responde. */
  pingDatabase(): Promise<void>;
  /** Migraciones aplicadas según la base; lanza si no se puede leer. */
  appliedMigrations(): Promise<number>;
  /** Migraciones que trae esta versión (el diario de drizzle); null si no se pudo leer. */
  expectedMigrations(): number | null;
  errorTrackingEnabled(): boolean;
  now(): number;
}

export type MigrationsStatus = 'ok' | 'pending' | 'unknown';

export interface HealthReport {
  status: 'ok' | 'error';
  database: 'ok' | 'unavailable';
  /** `pending`: la base tiene menos migraciones que esta versión (la app no debe recibir tráfico). */
  migrations: MigrationsStatus;
  errorTracking: 'enabled' | 'disabled';
  /** Tiempo de la consulta a la base, en ms. */
  databaseLatencyMs: number | null;
}

/**
 * Estado de la app, de la base de datos y de las migraciones. El estado HTTP lo decide quien llama: 503 si `status`
 * es `error` (base caída o migraciones pendientes). Más migraciones aplicadas que esperadas es normal (volver a una
 * versión anterior sin deshacer la base), no es un error.
 */
export async function checkHealth(probes: HealthProbes): Promise<HealthReport> {
  const errorTracking = probes.errorTrackingEnabled() ? 'enabled' : 'disabled';
  const started = probes.now();
  try {
    await probes.pingDatabase();
  } catch {
    return { status: 'error', database: 'unavailable', migrations: 'unknown', errorTracking, databaseLatencyMs: null };
  }
  const databaseLatencyMs = probes.now() - started;

  let migrations: MigrationsStatus = 'unknown';
  const expected = probes.expectedMigrations();
  if (expected !== null) {
    try {
      migrations = (await probes.appliedMigrations()) >= expected ? 'ok' : 'pending';
    } catch {
      migrations = 'unknown';
    }
  }
  return { status: migrations === 'pending' ? 'error' : 'ok', database: 'ok', migrations, errorTracking, databaseLatencyMs };
}
