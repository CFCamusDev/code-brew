import type { APIRoute } from 'astro';
import { cartSchema } from '../../../../lib/shop/checkout';
import { CartIssuesError, isOrderId, updateOrderItems } from '../../../../lib/server/shop';

export const prerender = false;

/** Ajusta las líneas de un pedido pendiente (el cliente reduce cantidad o quita un producto agotado antes de pagar). */
export const POST: APIRoute = async ({ params, request }) => {
  if (!isOrderId(params.id)) return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = cartSchema.safeParse(body?.items);
  if (!parsed.success) return Response.json({ error: 'Revisa tu pedido antes de actualizarlo.' }, { status: 400 });

  try {
    const summary = await updateOrderItems(params.id, parsed.data);
    return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof CartIssuesError) {
      return Response.json({ error: 'Revisa tu pedido antes de actualizarlo.', issues: error.issues }, { status: 409 });
    }
    throw error;
  }
};
