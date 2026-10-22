import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL } from 'astro:env/server';
import * as schema from './schema';

// Una sola conexión por proceso; se crea al primer uso para que `astro build` no necesite base de datos.
let instance: ReturnType<typeof createDb> | undefined;

function createDb() {
  if (!DATABASE_URL) throw new Error('Falta la variable de entorno DATABASE_URL');
  return drizzle(postgres(DATABASE_URL, { max: 10 }), { schema });
}

export function getDb() {
  instance ??= createDb();
  return instance;
}

export { schema };
