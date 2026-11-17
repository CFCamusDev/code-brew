import type { QuoteLine } from '../domain/types';
import type { OrderingDeps, OrderLineRecord } from './ports/ports';

/** Une las líneas cotizadas con el id de variante que necesita la persistencia. */
export async function withVariantIds(deps: OrderingDeps, lines: QuoteLine[]): Promise<OrderLineRecord[]> {
  const variants = await deps.catalog.findVariants(
    lines.map(line => line.sku),
    { now: deps.clock.now() }
  );
  const ids = new Map(variants.map(variant => [variant.sku, variant.variantId]));
  return lines.map(line => ({ ...line, variantId: ids.get(line.sku)! }));
}
