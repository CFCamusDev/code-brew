import { CartIssuesError, type CartLine, type OrderCustomer, type QuoteLine } from '../domain/types';
import { quoteCartUseCase } from './quote-cart';
import type { OrderingDeps, OrderLineRecord } from './ports/ports';

/** Une las líneas cotizadas con el id de variante que necesita la persistencia. */
export async function withVariantIds(deps: OrderingDeps, lines: QuoteLine[]): Promise<OrderLineRecord[]> {
  const variants = await deps.catalog.findVariants(lines.map(line => line.sku));
  const ids = new Map(variants.map(variant => [variant.sku, variant.variantId]));
  return lines.map(line => ({ ...line, variantId: ids.get(line.sku)! }));
}

/**
 * Caso de uso CrearPedido: recotiza en el servidor y guarda un pedido pendiente de pago.
 * Debe correr dentro de una transacción (UnitOfWork) para que cotización y escritura sean consistentes.
 */
export async function createOrder(deps: OrderingDeps, items: CartLine[], customer: OrderCustomer) {
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
  return order;
}
