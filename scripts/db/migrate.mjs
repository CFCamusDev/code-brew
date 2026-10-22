// Aplica las migraciones pendientes de ./drizzle. Se ejecuta al arrancar el contenedor y con `pnpm db:migrate`.
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');

const client = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });
  console.log('[db] migraciones aplicadas');
} finally {
  await client.end();
}
