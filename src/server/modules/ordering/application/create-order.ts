import { CartIssuesError, type CartLine, type OrderCustomer } from '../domain/types';
import { quoteCartUseCase } from './quote-cart';
import { DEFAULT_RESERVATION_MS, reserveStock } from './reserve-stock';
import { withVariantIds } from './with-variant-ids';
import type { OrderingDeps } from './ports/ports';

/**
 * Caso de uso CrearPedido: recotiza en el servidor, reserva el stock y guarda un pedido pendiente de pago.
 * Debe correr dentro de una transacción (UnitOfWork): primero bloquea las variantes en orden de id y recién entonces
 * mira la disponibilidad, así dos pedidos simultáneos del último ítem no pueden ganarlo los dos. Si falta stock, el
 * pedido no se crea y se informa por producto.
 */
export async function createOrder(deps: OrderingDeps, items: CartLine[], customer: OrderCustomer) {
  await deps.reservations.lockVariants(items.map(item => item.sku));
  const quote = await quoteCartUseCase(deps, items, { zoneSlug: customer.zone, region: customer.region });
  if (quote.issues.length) throw new CartIssuesError(quote.issues);
  if (quote.shippingCents === null || quote.totalCents === null) {
    throw new CartIssuesError([{ sku: '', message: 'La zona de envío elegida no está disponible.' }]);
  }
  const zone = await deps.orders.findActiveZoneBySlug(customer.zone);
  if (!zone) throw new CartIssuesError([{ sku: '', message: 'La zona de envío elegida no está disponible.' }]);

  const order = await deps.orders.insertOrder({
    customer,
    zone,
    subtotalCents: quote.subtotalCents,
    shippingCents: quote.shippingCents,
    totalCents: quote.totalCents
  });
  await deps.orders.replaceItems(order.id, await withVariantIds(deps, quote.lines));
  await reserveStock(deps, order.id, quote.lines, new Date(deps.clock.now().getTime() + DEFAULT_RESERVATION_MS));
  return order;
}
