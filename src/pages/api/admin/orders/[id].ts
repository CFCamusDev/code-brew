import type { APIRoute } from 'astro';
import { z } from 'zod';
import { AdminActionError, changeStatus, refundOrder, saveAdminNotes } from '../../../../lib/server/admin/orders';
import { isOrderId } from '../../../../lib/server/shop';

export const prerender = false;

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('status'),
    to: z.enum(['preparing', 'shipped', 'delivered', 'cancelled']),
    carrier: z.string().trim().max(80).optional(),
    trackingNumber: z.string().trim().max(120).optional(),
    note: z.string().trim().max(500).optional()
  }),
  z.object({
    action: z.literal('refund'),
    reason: z.enum(['solicitud_comprador', 'duplicado', 'fraudulento']),
    restock: z.boolean(),
    manual: z.boolean(),
    note: z.string().trim().max(500).optional()
  }),
  z.object({ action: z.literal('notes'), notes: z.string().trim().max(2000) })
]);

export const POST: APIRoute = async ({ params, request, locals }) => {
  const admin = locals.admin!;
  if (!isOrderId(params.id)) return Response.json({ error: 'Pedido no encontrado.' }, { status: 404 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Datos inválidos.' }, { status: 400 });
  const body = parsed.data;

  try {
    if (body.action === 'status') {
      await changeStatus(params.id, body.to, admin.id, body);
    } else if (body.action === 'refund') {
      if (admin.role !== 'admin') return Response.json({ error: 'Solo un administrador puede reembolsar.' }, { status: 403 });
      await refundOrder(params.id, admin.id, { reason: body.reason, restockItems: body.restock, manual: body.manual, note: body.note });
    } else {
      await saveAdminNotes(params.id, body.notes);
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminActionError) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
};
