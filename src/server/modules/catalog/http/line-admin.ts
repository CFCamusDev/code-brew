import type { APIContext } from 'astro';
import { lineInput, lineAction } from '../../../../contracts/admin-lines';
import { DomainError, NotFoundError } from '../../../shared/errors';
import { listAdminLines, addAdminLine, editAdminLine, publishLine, retireLine } from '../index';

export async function lineAdminRequest(context: APIContext, operation: 'list' | 'create' | 'edit' | 'status') {
  if (!context.locals.admin) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });
  if (operation !== 'list' && context.locals.admin.role !== 'admin') return Response.json({ error: 'Solo un administrador puede modificar líneas.' }, { status: 403 });
  try {
    if (operation === 'list') return Response.json({ lines: await listAdminLines() });
    const id = Number(context.params.id);
    if (operation !== 'create' && (!Number.isSafeInteger(id) || id <= 0)) return Response.json({ error: 'Identificador inválido.' }, { status: 400 });
    const body = await context.request.json().catch(() => null);
    if (operation === 'status') {
      const parsed = lineAction.safeParse(body);
      if (!parsed.success) return Response.json({ error: 'Acción inválida.' }, { status: 400 });
      const result = await (parsed.data.action === 'activate' ? publishLine(id) : retireLine(id));
      return Response.json({ ok: true, ...result });
    }
    const parsed = lineInput.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }, { status: 400 });
    const line = operation === 'create' ? await addAdminLine(parsed.data) : await editAdminLine(id, parsed.data);
    return Response.json({ ok: true, line }, { status: operation === 'create' ? 201 : 200 });
  } catch (error) {
    if (error instanceof DomainError) return Response.json({ error: error.message }, { status: error instanceof NotFoundError ? 404 : 409 });
    throw error;
  }
}
