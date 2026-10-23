import { z } from 'zod';
import { adminAction } from '../../../../lib/server/admin/api';
import { ForbiddenError } from '../../../../lib/server/admin/orders';
import { CATEGORY_LABEL, createPurchase, deletePurchase, updatePurchase, type PurchaseCategory } from '../../../../lib/server/admin/purchases';

export const prerender = false;

const purchaseSchema = z.object({
  purchasedOn: z.iso.date('Fecha inválida.'),
  supplier: z.string().trim().min(1, 'Indica el proveedor.').max(120),
  category: z.enum(Object.keys(CATEGORY_LABEL) as [PurchaseCategory, ...PurchaseCategory[]]),
  description: z.string().trim().min(1, 'Describe la compra.').max(300),
  documentNumber: z.string().trim().max(40).optional(),
  amountCents: z.number().int().min(1, 'El monto debe ser mayor a 0.').max(100_000_000),
  notes: z.string().trim().max(500).optional()
});

const bodySchema = z.discriminatedUnion('action', [
  purchaseSchema.extend({ action: z.literal('create') }),
  purchaseSchema.extend({ action: z.literal('update'), id: z.number().int().positive() }),
  z.object({ action: z.literal('delete'), id: z.number().int().positive() })
]);

export const POST = adminAction(bodySchema, async (body, { locals }) => {
  if (body.action === 'delete') {
    if (locals.admin!.role !== 'admin') throw new ForbiddenError('Solo un administrador puede borrar compras.');
    return void (await deletePurchase(body.id));
  }
  const { action, ...data } = body;
  if (action === 'create') await createPurchase(data, locals.admin!.id);
  else await updatePurchase((body as { id: number }).id, data);
});
