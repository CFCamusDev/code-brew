import type { APIRoute } from 'astro';
import { z } from 'zod';
import { updateProduct } from '../../../../lib/server/admin/products';
import { AdminActionError } from '../../../../lib/server/admin/orders';

export const prerender = false;

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  roast: z.string().trim().min(1).max(80),
  grinds: z.array(z.string().trim().min(1).max(80)).min(1, 'Deja al menos una molienda.').max(10),
  imageUrl: z.string().trim().max(500).nullable(),
  active: z.boolean()
});

/** Solo administradores: cambia lo que ve el cliente. */
export const POST: APIRoute = async ({ params, request, locals }) => {
  if (locals.admin!.role !== 'admin') return Response.json({ error: 'Solo un administrador puede editar productos.' }, { status: 403 });
  const id = Number(params.id);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!Number.isInteger(id) || !parsed.success) {
    return Response.json({ error: parsed.error?.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 });
  }
  try {
    await updateProduct(id, parsed.data);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminActionError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
};
