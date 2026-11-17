import type { Clock } from '../../../shared/clock';
import { quoteCart } from '../domain/cart-quote';
import type { CartLine, Quote } from '../domain/types';
import type { CatalogReader, ShippingProvider } from './ports/ports';

/**
 * Caso de uso CotizarCarrito. El stock disponible es el físico menos las reservas vigentes; `excludeOrderId` evita que
 * un pedido compita contra sus propias reservas al recotizarlo.
 */
export async function quoteCartUseCase(
  deps: { catalog: CatalogReader; shipping: ShippingProvider; clock: Clock },
  items: CartLine[],
  destination: { zoneSlug?: string; region?: string; excludeOrderId?: string } = {}
): Promise<Quote> {
  const skus = [...new Set(items.map(item => item.sku))];
  const { excludeOrderId, ...place } = destination;
  const [variants, shipping] = await Promise.all([
    skus.length ? deps.catalog.findVariants(skus, { now: deps.clock.now(), excludeOrderId }) : Promise.resolve([]),
    deps.shipping.load()
  ]);
  return quoteCart(items, variants, shipping, place);
}
