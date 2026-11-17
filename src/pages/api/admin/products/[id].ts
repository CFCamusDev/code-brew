import type { APIRoute } from 'astro';
import { editProductInput as bodySchema } from '../../../../contracts/admin-products';
import { updateProduct } from '../../../../lib/server/admin/products';
import { AdminActionError } from '../../../../lib/server/admin/orders';
import { publicationErrorResponse } from '../../../../lib/server/admin/publication-response';

export const prerender = false;

/** Solo administradores: cambia lo que ve el cliente. */
export const POST: APIRoute = async ({ params, request, locals }) => {
  if (locals.admin!.role !== 'admin') return Response.json({ error: 'Solo un administrador puede editar productos.' }, { status: 403 });
  const id = Number(params.id);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || !parsed.success) {
    return Response.json({ error: parsed.error?.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 });
  }
  try {
    await updateProduct(id, parsed.data);
    return Response.json({ ok: true });
  } catch (error) {
    const response = publicationErrorResponse(error);
    if (response) return response;
    if (error instanceof AdminActionError) return Response.json({ error: error.message }, { status: 404 });
    throw error;
  }
};
