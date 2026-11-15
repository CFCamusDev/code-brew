import { CartIssuesError, type CartLine } from '../domain/types';
import { withVariantIds } from './create-order';
import { quoteCartUseCase } from './quote-cart';
import type { OrderingDeps } from './ports/ports';

/**
 * Reemplaza las líneas de un pedido pendiente (el cliente ajusta cantidades o quita un producto cuando el stock
 * se agotó antes de pagar). Nunca sobre un pedido que ya no admite cambios. Debe correr bajo UnitOfWork.
 */
export async function updateOrderItems(deps: OrderingDeps, orderId: string, items: CartLine[]) {
  const order = await deps.orders.lockOrder(orderId);
  if (!order) throw new CartIssuesError([{ sku: '', message: 'Pedido no encontrado.' }]);
  if (order.status !== 'pending') throw new CartIssuesError([{ sku: '', message: 'Este pedido ya no se puede modificar.' }]);

  const zoneSlug = order.shippingZoneId ? ((await deps.orders.findZoneSlugById(order.shippingZoneId)) ?? undefined) : undefined;
  const quote = await quoteCartUseCase(deps, items, { zoneSlug, region: order.shippingRegion });
  if (quote.issues.length) throw new CartIssuesError(quote.issues);
  if (quote.shippingCents === null || quote.totalCents === null) {
    throw new CartIssuesError([{ sku: '', message: 'La zona de envío de este pedido ya no está disponible.' }]);
  }

  await deps.orders.replaceItems(orderId, await withVariantIds(deps, quote.lines));
  await deps.orders.updateTotals(orderId, {
    subtotalCents: quote.subtotalCents,
    shippingCents: quote.shippingCents,
    totalCents: quote.totalCents
  });
  return { items: quote.lines, subtotalCents: quote.subtotalCents, shippingCents: quote.shippingCents, totalCents: quote.totalCents };
}
