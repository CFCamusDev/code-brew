import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDb } from '../../../../lib/server/db';
import { orders } from '../../../../lib/server/db/schema';
import { isOrderId } from '../../../../lib/server/shop';

export const prerender = false;

/** Estado del pedido, para que la página de pago espere la confirmación de PagoEfectivo o billeteras. */
export const GET: APIRoute = async ({ params }) => {
  if (!isOrderId(params.id)) return Response.json({ status: 'not_found' }, { status: 404 });
  const [order] = await getDb().select({ status: orders.status }).from(orders).where(eq(orders.id, params.id));
  if (!order) return Response.json({ status: 'not_found' }, { status: 404 });
  return Response.json({ status: order.status }, { headers: { 'Cache-Control': 'no-store' } });
};
