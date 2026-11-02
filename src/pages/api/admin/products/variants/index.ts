import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createVariant } from '../../../../../lib/server/admin/products';
import { AdminActionError } from '../../../../../lib/server/admin/orders';

export const prerender = false;

const bodySchema = z.object({
  productId: z.number().int().positive(),
  format: z.string().trim().min(1, 'Indica el formato (ej. 250 g).').max(40),
  priceCents: z.number().int().min(100, 'El precio mínimo es S/ 1.00.').max(1_000_000),
  stock: z.number().int().min(0).max(100_000),
  bags: z.number().int().min(1).max(20)
});

/** Solo administradores: nueva presentación (formato) para un producto existente. */
export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.admin!.role !== 'admin') return Response.json({ error: 'Solo un administrador puede crear presentaciones.' }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 });
  try {
    const { productId, ...data } = parsed.data;
    const variant = await createVariant(productId, data);
    return Response.json({ ok: true, ...variant }, { status: 201 });
  } catch (error) {
    if (error instanceof AdminActionError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
};
