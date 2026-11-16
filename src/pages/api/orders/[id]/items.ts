import type { APIRoute } from 'astro';
import type { CartIssuesErrorResponse } from '../../../../contracts/cart';
import { updateOrderItemsRequestSchema, type UpdateOrderItemsResponse } from '../../../../contracts/orders';
import { isOrderId } from '../../../../lib/server/shop';
import { CartIssuesError, orderingFor } from '../../../../server/modules/ordering';
import { unitOfWork } from '../../../../server/shared';

export const prerender = false;

/** Ajusta las líneas de un pedido pendiente (el cliente reduce cantidad o quita un producto agotado antes de pagar). */
export const POST: APIRoute = async ({ params, request }) => {
  const orderId = params.id;
  if (!isOrderId(orderId)) return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = updateOrderItemsRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: 'Revisa tu pedido antes de actualizarlo.' }, { status: 400 });

  try {
    const summary = await unitOfWork.run(tx => orderingFor(tx).updateOrderItems(orderId, parsed.data.items));
    return Response.json(summary satisfies UpdateOrderItemsResponse, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof CartIssuesError) {
      return Response.json({ error: 'Revisa tu pedido antes de actualizarlo.', issues: error.issues } satisfies CartIssuesErrorResponse, { status: 409 });
    }
    throw error;
  }
};
