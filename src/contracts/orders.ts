import { z } from 'zod';
import { cartSchema, quoteResponseSchema } from './cart';

// Contratos de un pedido ya creado (POST /api/orders/[id]/items): el cliente ajusta cantidades o quita un producto
// que se agotó antes de pagar.

export const updateOrderItemsRequestSchema = z.object({ items: cartSchema });
export type UpdateOrderItemsRequest = z.infer<typeof updateOrderItemsRequestSchema>;

/** Respuesta de POST /api/orders/[id]/items: las líneas y totales recalculados. */
export const updateOrderItemsResponseSchema = z.object({
  items: quoteResponseSchema.shape.lines,
  subtotalCents: z.number().int(),
  shippingCents: z.number().int(),
  totalCents: z.number().int()
});
export type UpdateOrderItemsResponse = z.infer<typeof updateOrderItemsResponseSchema>;
