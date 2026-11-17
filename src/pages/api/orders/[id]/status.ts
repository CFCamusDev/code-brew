import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import type { OrderStatusResponse } from '../../../../contracts/orders';
import { formatDateTime } from '../../../../lib/shop/format';
import { getDb } from '../../../../lib/server/db';
import { orders } from '../../../../lib/server/db/schema';
import { isOrderId } from '../../../../lib/server/shop';
import { findPendingPaymentCode } from '../../../../server/modules/payments';

export const prerender = false;

/**
 * Estado del pedido, para que la página de pago espere la confirmación de PagoEfectivo o billeteras. Con `?code=1`
 * agrega el CIP vigente (consulta la pasarela, así que la página lo pide una vez y no en cada sondeo).
 */
export const GET: APIRoute = async ({ params, url }) => {
  if (!isOrderId(params.id)) return Response.json({ status: 'not_found' }, { status: 404 });
  const [order] = await getDb().select({ status: orders.status }).from(orders).where(eq(orders.id, params.id));
  if (!order) return Response.json({ status: 'not_found' }, { status: 404 });
  const withCode = url.searchParams.get('code') === '1' && order.status === 'pending';
  const code = withCode ? await findPendingPaymentCode(params.id) : null;
  const body: OrderStatusResponse = withCode
    ? { status: order.status, payment: code && { ...code, expiresLabel: formatDateTime(code.expiresAt) } }
    : { status: order.status };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
};
