import type { APIRoute } from 'astro';
import { z } from 'zod';
import { adjustStock, updateVariant } from '../../../../../lib/server/admin/products';
import { AdminActionError } from '../../../../../lib/server/admin/orders';

export const prerender = false;

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    format: z.string().trim().min(1).max(40),
    priceCents: z.number().int().min(100, 'El precio mínimo es S/ 1.00.').max(1_000_000),
    bags: z.number().int().min(1).max(20),
    active: z.boolean()
  }),
  z.object({
    action: z.literal('stock'),
    delta: z.number().int().refine(value => value !== 0, 'Indica cuánto sumar o restar.').refine(value => Math.abs(value) <= 10_000),
    reason: z.enum(['adjustment', 'purchase']),
    note: z.string().trim().max(300).optional()
  })
]);

export const POST: APIRoute = async ({ params, request, locals }) => {
  const admin = locals.admin!;
  const id = Number(params.id);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!Number.isInteger(id) || !parsed.success) {
    return Response.json({ error: parsed.error?.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 });
  }
  const body = parsed.data;
  try {
    if (body.action === 'update') {
      if (admin.role !== 'admin') return Response.json({ error: 'Solo un administrador puede cambiar precios.' }, { status: 403 });
      await updateVariant(id, body);
      return Response.json({ ok: true });
    }
    const stock = await adjustStock(id, admin.id, body);
    return Response.json({ ok: true, stock });
  } catch (error) {
    if (error instanceof AdminActionError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
};
