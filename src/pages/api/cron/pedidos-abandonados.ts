import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { CRON_SECRET } from 'astro:env/server';
import { cancelAbandonedOrders } from '../../../lib/server/admin/orders';

export const prerender = false;

function authorized(header: string | null) {
  if (!CRON_SECRET || !header?.startsWith('Bearer ')) return false;
  const received = Buffer.from(header.slice(7));
  const expected = Buffer.from(CRON_SECRET);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Tarea programada (cada hora): POST con `Authorization: Bearer <CRON_SECRET>`. */
export const POST: APIRoute = async ({ request }) => {
  if (!CRON_SECRET) return Response.json({ error: 'Tareas programadas desactivadas (falta CRON_SECRET).' }, { status: 503 });
  if (!authorized(request.headers.get('authorization'))) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const cancelled = await cancelAbandonedOrders();
  if (cancelled) console.info(`[cron] ${cancelled} pedidos abandonados cancelados`);
  return Response.json({ cancelled });
};
