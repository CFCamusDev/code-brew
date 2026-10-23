import type { Quote } from './checkout';

type FreeShippingRule = Pick<Quote['zones'][number], 'freeFromCents' | 'freeFromBags'>;

/** Envío gratis por subtotal o por cantidad de bolsas. La comparten el servidor (cobro) y el checkout (vista previa). */
export function isFreeShipping(zone: FreeShippingRule, subtotalCents: number, bags: number) {
  return (
    (zone.freeFromCents !== null && subtotalCents >= zone.freeFromCents) ||
    (zone.freeFromBags !== null && bags >= zone.freeFromBags)
  );
}
