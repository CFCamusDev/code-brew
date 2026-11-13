import { quoteCart } from '../domain/cart-quote';
import type { CartLine, Quote } from '../domain/types';
import type { CatalogReader, ShippingProvider } from './ports/ports';

/** Caso de uso CotizarCarrito. */
export async function quoteCartUseCase(
  deps: { catalog: CatalogReader; shipping: ShippingProvider },
  items: CartLine[],
  destination: { zoneSlug?: string; region?: string } = {}
): Promise<Quote> {
  const skus = [...new Set(items.map(item => item.sku))];
  const [variants, shipping] = await Promise.all([
    skus.length ? deps.catalog.findVariants(skus) : Promise.resolve([]),
    deps.shipping.load()
  ]);
  return quoteCart(items, variants, shipping, destination);
}
