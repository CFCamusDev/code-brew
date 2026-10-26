import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { getDb } from '../../lib/server/db';
import { version } from '../../../package.json';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: 'ok', database: 'ok', version }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[health] base de datos no disponible', error);
    return Response.json({ status: 'error', database: 'unavailable', version }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
