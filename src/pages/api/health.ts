import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { getDb } from '../../lib/server/db';
import { isErrorTrackingEnabled } from '../../lib/server/error-tracking';
import { checkHealth } from '../../lib/server/health';
import { logger } from '../../lib/server/logger';
import { version } from '../../../package.json';

export const prerender = false;

/** Cantidad de migraciones que trae esta versión: las entradas del diario de drizzle que se despliega junto a la app. */
function expectedMigrations(): number | null {
  try {
    const journal = JSON.parse(readFileSync(join(process.cwd(), 'drizzle', 'meta', '_journal.json'), 'utf8'));
    return Array.isArray(journal.entries) ? journal.entries.length : null;
  } catch {
    return null;
  }
}

export const GET: APIRoute = async () => {
  const report = await checkHealth({
    pingDatabase: async () => void (await getDb().execute(sql`select 1`)),
    appliedMigrations: async () => {
      const rows = await getDb().execute<{ count: number }>(sql`select count(*)::int as count from drizzle.__drizzle_migrations`);
      return Number(rows[0]?.count ?? 0);
    },
    expectedMigrations,
    errorTrackingEnabled: isErrorTrackingEnabled,
    now: () => Date.now()
  });
  if (report.status === 'error') logger.error('health: la app no está lista', undefined, { database: report.database, migrations: report.migrations });
  return Response.json({ ...report, version, environment: process.env.APP_ENV || 'unspecified', deploymentId: process.env.DEPLOYMENT_ID || null }, { status: report.status === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
};
