import type { APIRoute } from 'astro';
import { createProductInput as bodySchema } from '../../../../contracts/admin-products';
import { createProduct } from '../../../../lib/server/admin/products';
import { publicationErrorResponse } from '../../../../lib/server/admin/publication-response';
export const prerender = false;

/** Solo administradores: crea un producto en una línea y valida su estado inicial. */
export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.admin!.role !== 'admin') return Response.json({ error: 'Solo un administrador puede crear productos.' }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 });
  try {
    const product = await createProduct(parsed.data);
    return Response.json({ ok: true, ...product }, { status: 201 });
  } catch (error) {
    const response = publicationErrorResponse(error);
    if (response) return response;
    throw error;
  }
};
