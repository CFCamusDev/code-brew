import type { APIRoute } from 'astro';
import { quoteRequestSchema, type Quote } from '../../../contracts/cart';
import { getDb } from '../../../lib/server/db';
import { orderingFor } from '../../../server/modules/ordering';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const parsed = quoteRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Carrito inválido.' }, { status: 400 });

  const quote = await orderingFor(getDb()).quoteCart(parsed.data.items, { zoneSlug: parsed.data.zone, region: parsed.data.region });
  return Response.json(quote satisfies Quote, { headers: { 'Cache-Control': 'no-store' } });
};
