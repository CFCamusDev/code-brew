import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import { CULQI_WEBHOOK_SECRET } from 'astro:env/server';
import { syncCulqiOrder } from '../../../lib/server/payments';
import { logger } from '../../../lib/server/logger';

export const prerender = false;

function validKey(received: string | null) {
  if (!CULQI_WEBHOOK_SECRET) return false;
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(CULQI_WEBHOOK_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Webhook de Culqi (evento order.status.changed). URL a registrar en CulqiPanel:
 * https://<dominio>/api/webhooks/culqi?key=<CULQI_WEBHOOK_SECRET>
 * El cuerpo solo se usa para saber qué orden cambió; el estado real se consulta a la API de Culqi.
 */
export const POST: APIRoute = async ({ request, url }) => {
  if (!CULQI_WEBHOOK_SECRET) return Response.json({ error: 'Webhook desactivado (falta CULQI_WEBHOOK_SECRET).' }, { status: 503 });
  if (!validKey(url.searchParams.get('key'))) return new Response('No autorizado', { status: 401 });

  const event = (await request.json().catch(() => null)) as { type?: string; data?: unknown } | null;
  if (!event?.type) return Response.json({ received: false }, { status: 400 });
  if (event.type !== 'order.status.changed') return Response.json({ received: true, ignored: event.type });

  // `data` llega como JSON en texto; se acepta también como objeto.
  let data: { id?: unknown } | null = null;
  try {
    data = typeof event.data === 'string' ? JSON.parse(event.data) : (event.data as { id?: unknown });
  } catch {
    data = null;
  }
  if (typeof data?.id !== 'string' || !data.id.startsWith('ord_')) return Response.json({ received: false }, { status: 400 });

  try {
    const result = await syncCulqiOrder(data.id);
    return Response.json({ received: true, result });
  } catch (error) {
    // 500 para que Culqi reintente la notificación.
    logger.error('[culqi] webhook falló', error);
    return Response.json({ received: false }, { status: 500 });
  }
};
