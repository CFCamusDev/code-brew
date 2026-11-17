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

/** Código CIP pendiente de un pago por orden (agentes, banca, billetera). */
export const pendingPaymentSchema = z.object({
  code: z.string(),
  amountCents: z.number().int(),
  expiresAt: z.string(),
  /** Vencimiento ya formateado en hora de Lima por el servidor, para que la página no difiera al hidratar. */
  expiresLabel: z.string()
});
export type PendingPayment = z.infer<typeof pendingPaymentSchema>;

/** Respuesta de GET /api/orders/[id]/status. Con `?code=1` incluye el CIP vigente si el pedido sigue pendiente. */
export const orderStatusResponseSchema = z.object({ status: z.string(), payment: pendingPaymentSchema.nullable().optional() });
export type OrderStatusResponse = z.infer<typeof orderStatusResponseSchema>;
