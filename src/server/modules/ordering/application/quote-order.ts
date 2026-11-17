import type { CartLine, Quote } from '../domain/types';
import { quoteCartUseCase } from './quote-cart';
import type { OrderingDeps } from './ports/ports';

/**
 * Recotiza un pedido ya creado con el stock y precios vigentes (el pedido guarda el id de zona, no el slug).
 * Con `id`, sus propias reservas no cuentan en su contra: el pedido ya tiene el stock prometido.
 */
export async function quoteOrder(
  deps: OrderingDeps,
  order: { id?: string; items: CartLine[]; shippingZoneId: number | null; shippingRegion: string }
): Promise<Quote> {
  const zoneSlug = order.shippingZoneId ? ((await deps.orders.findZoneSlugById(order.shippingZoneId)) ?? undefined) : undefined;
  const items = order.items.map(item => ({ sku: item.sku, grind: item.grind, quantity: item.quantity }));
  return quoteCartUseCase(deps, items, { zoneSlug, region: order.shippingRegion, excludeOrderId: order.id });
}
