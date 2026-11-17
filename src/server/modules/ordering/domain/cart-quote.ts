import type { CartLine, CatalogVariant, Quote, QuoteIssue, QuoteLine, QuoteZone } from './types';

export type ShippingResult =
  | { status: 'ok'; shippingCents: number }
  | { status: 'no_zone' }
  | { status: 'region_not_served'; message: string };

/** Lo que la cotización necesita del envío: las zonas visibles y el cálculo. */
export interface ShippingRules {
  zones: QuoteZone[];
  calculate(input: { zoneSlug?: string; region?: string; subtotalCents: number; bags: number }): ShippingResult;
}

/** Disponible = stock físico − reservas vigentes (ADR 0005). Nunca negativo. */
export const availableStock = (row: Pick<CatalogVariant, 'stock' | 'reserved'>) => Math.max(0, row.stock - row.reserved);

const stockMessage = (row: CatalogVariant) => {
  const available = availableStock(row);
  return available === 0
    ? `${row.productName} ${row.format} está agotado por ahora.`
    : available === 1
      ? `Solo queda 1 unidad de ${row.productName} ${row.format}.`
      : `Solo quedan ${available} unidades de ${row.productName} ${row.format}.`;
};

/**
 * Calcula precios, envío y total con los datos vigentes del catálogo. Regla pura: nunca usa precios del navegador.
 * Una línea con problema se omite del total y se reporta en `issues`.
 */
export function quoteCart(
  items: CartLine[],
  variants: CatalogVariant[],
  shipping: ShippingRules,
  destination: { zoneSlug?: string; region?: string }
): Quote {
  const bySku = new Map(variants.map(row => [row.sku, row]));
  const requestedBySku = new Map<string, number>();
  for (const item of items) requestedBySku.set(item.sku, (requestedBySku.get(item.sku) ?? 0) + item.quantity);

  const lines: QuoteLine[] = [];
  const issues: QuoteIssue[] = [];
  const reportedStock = new Set<string>();
  let bags = 0;

  for (const item of items) {
    const row = bySku.get(item.sku);
    if (!row || !row.variantActive || !row.productActive) {
      issues.push({ sku: item.sku, message: 'Este producto ya no está disponible.' });
      continue;
    }
    if (!row.grinds.includes(item.grind)) {
      issues.push({ sku: item.sku, message: `La molienda "${item.grind}" no está disponible para ${row.productName}.` });
      continue;
    }
    if (requestedBySku.get(item.sku)! > availableStock(row)) {
      if (!reportedStock.has(item.sku)) {
        reportedStock.add(item.sku);
        issues.push({ sku: item.sku, message: stockMessage(row) });
      }
      continue;
    }
    bags += row.bags * item.quantity;
    lines.push({
      sku: item.sku,
      grind: item.grind,
      quantity: item.quantity,
      productName: row.productName,
      format: row.format,
      unitPriceCents: row.priceCents,
      lineTotalCents: row.priceCents * item.quantity
    });
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const result = shipping.calculate({ ...destination, subtotalCents, bags });
  if (result.status === 'region_not_served') issues.push({ sku: '', message: result.message });
  const shippingCents = result.status === 'ok' ? result.shippingCents : null;

  return {
    lines,
    issues,
    zones: shipping.zones,
    bags,
    subtotalCents,
    shippingCents,
    totalCents: shippingCents === null ? null : subtotalCents + shippingCents
  };
}
