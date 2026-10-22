import type { APIRoute } from 'astro';
import { quoteSchema } from '../../../lib/shop/checkout';
import { getDb } from '../../../lib/server/db';
import { quoteCart } from '../../../lib/server/shop';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const parsed = quoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Carrito inválido.' }, { status: 400 });

  const quote = await quoteCart(getDb(), parsed.data.items, parsed.data.zone);
  return Response.json(quote, { headers: { 'Cache-Control': 'no-store' } });
};
