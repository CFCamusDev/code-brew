import type { APIRoute } from 'astro';
import { z } from 'zod';
import { changeProductStatus } from '../../../../../server/modules/catalog';
import { publicationErrorResponse } from '../../../../../lib/server/admin/publication-response';
export const prerender = false;
const schema = z.object({ status: z.enum(['active', 'discontinued']) }).strict();
export const POST: APIRoute = async ({ params, request, locals }) => {
  if (locals.admin?.role !== 'admin') return Response.json({ error: 'Solo un administrador puede cambiar la publicación.' }, { status: 403 });
  const id = Number(params.id);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!Number.isSafeInteger(id) || id <= 0 || !parsed.success) return Response.json({ error: 'Datos inválidos.' }, { status: 400 });
  try {
    const result = await changeProductStatus(id, parsed.data.status);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const response = publicationErrorResponse(error);
    if (response) return response;
    throw error;
  }
};
