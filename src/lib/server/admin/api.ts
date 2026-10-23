import type { APIContext } from 'astro';
import type { z } from 'zod';
import { AdminActionError, ForbiddenError } from './orders';

/**
 * Envoltorio común de las acciones del panel: valida el cuerpo con zod, exige rol si corresponde
 * y convierte AdminActionError en 409 con su mensaje.
 */
export function adminAction<S extends z.ZodType>(
  schema: S,
  handler: (data: z.output<S>, context: APIContext) => Promise<Record<string, unknown> | void>,
  { adminOnly = false } = {}
) {
  return async (context: APIContext) => {
    if (adminOnly && context.locals.admin?.role !== 'admin') {
      return Response.json({ error: 'Solo un administrador puede hacer esto.' }, { status: 403 });
    }
    const parsed = schema.safeParse(await context.request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 });
    try {
      return Response.json({ ok: true, ...((await handler(parsed.data, context)) ?? {}) });
    } catch (error) {
      if (error instanceof AdminActionError) {
        return Response.json({ error: error.message }, { status: error instanceof ForbiddenError ? 403 : 409 });
      }
      throw error;
    }
  };
}

export const idParam = (context: APIContext) => {
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new AdminActionError('Registro no encontrado.');
  return id;
};
