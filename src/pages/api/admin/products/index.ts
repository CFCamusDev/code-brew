import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createProduct } from '../../../../lib/server/admin/products';

export const prerender = false;

const bodySchema = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre.').max(80),
  roast: z.string().trim().min(1, 'Indica el tueste.').max(80),
  grinds: z.array(z.string().trim().min(1).max(80)).min(1, 'Deja al menos una molienda.').max(10),
  imageUrl: z.string().trim().max(500).nullable()
});

/** Solo administradores: alta de un perfil de café nuevo (el catálogo editorial de la landing no cambia solo). */
export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.admin!.role !== 'admin') return Response.json({ error: 'Solo un administrador puede crear productos.' }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 });
  const product = await createProduct(parsed.data);
  return Response.json({ ok: true, ...product }, { status: 201 });
};
