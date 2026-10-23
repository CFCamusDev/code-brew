import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { getDb } from '../../lib/server/db';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: 'ok', database: 'ok' });
  } catch (error) {
    console.error('[health] base de datos no disponible', error);
    return Response.json({ status: 'error', database: 'unavailable' }, { status: 503 });
  }
};
