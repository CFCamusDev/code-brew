import { z } from 'zod';
import { adminAction } from '../../../../lib/server/admin/api';
import { cancelAbandonedOrders } from '../../../../lib/server/admin/orders';

export const prerender = false;

/** Ejecuta a mano la misma limpieza que la tarea programada. */
export const POST = adminAction(z.object({}), async (_body, { locals }) => ({ cancelled: await cancelAbandonedOrders(locals.admin!.id) }), {
  adminOnly: true
});
