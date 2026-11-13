import type { APIRoute } from 'astro';
import { CULQI_WEBHOOK_SECRET, CULQI_WEBHOOK_SECRET_PREVIOUS } from 'astro:env/server';
import { isValidWebhookKey } from '../../../server/modules/payments';
import { syncCulqiOrder } from '../../../lib/server/payments';

export const prerender = false;

/**
 * Webhook de Culqi (evento order.status.changed). URL a registrar en CulqiPanel:
 * https://<dominio>/api/webhooks/culqi?key=<CULQI_WEBHOOK_SECRET>
 * La clave va en la URL porque CulqiPanel no permite cabeceras propias: por eso nunca se escribe en logs (ni aquí ni
 * en Nginx, que la quita del registro de accesos) y se puede rotar con CULQI_WEBHOOK_SECRET_PREVIOUS (ver README).
 * El cuerpo solo se usa para saber qué orden cambió; el estado real se consulta a la API de Culqi.
 */
export const POST: APIRoute = async ({ request, url }) => {
  if (!CULQI_WEBHOOK_SECRET) return Response.json({ error: 'Webhook desactivado (falta CULQI_WEBHOOK_SECRET).' }, { status: 503 });
  if (!isValidWebhookKey(url.searchParams.get('key'), [CULQI_WEBHOOK_SECRET, CULQI_WEBHOOK_SECRET_PREVIOUS])) return new Response('No autorizado', { status: 401 });

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
    console.error('[culqi] webhook falló', error);
    return Response.json({ received: false }, { status: 500 });
  }
};
