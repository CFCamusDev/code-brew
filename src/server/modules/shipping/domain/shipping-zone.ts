/** Zona de envío con sus tarifas por departamento. Datos y reglas puras: sin base de datos ni framework. */
export interface ShippingZone {
  slug: string;
  name: string;
  eta: string;
  /** Tarifa base de la zona, en céntimos. */
  priceCents: number;
  freeFromCents: number | null;
  freeFromBags: number | null;
  /** Departamentos que atiende; null = todos. */
  regions: string[] | null;
  /** Tarifas propias por departamento (reemplazan a la base). */
  regionRates: { region: string; priceCents: number }[];
}

type FreeShippingRule = Pick<ShippingZone, 'freeFromCents' | 'freeFromBags'>;

/** Envío gratis por subtotal o por cantidad de bolsas. La comparten el servidor (cobro) y el checkout (vista previa). */
export function isFreeShipping(zone: FreeShippingRule, subtotalCents: number, bags: number) {
  return (
    (zone.freeFromCents !== null && subtotalCents >= zone.freeFromCents) ||
    (zone.freeFromBags !== null && bags >= zone.freeFromBags)
  );
}

/** ¿La zona atiende este departamento? Sin departamento o sin restricción, sí. */
export function servesRegion(zone: Pick<ShippingZone, 'regions'>, region?: string) {
  return !region || !zone.regions || zone.regions.includes(region);
}

/** Tarifa del departamento si existe; si no, la base de la zona. */
export function zoneRate(zone: Pick<ShippingZone, 'priceCents' | 'regionRates'>, region?: string) {
  return zone.regionRates.find(rate => rate.region === region)?.priceCents ?? zone.priceCents;
}

/** Costo de envío en céntimos para un pedido en esa zona y departamento. */
export function shippingCost(zone: ShippingZone, region: string | undefined, subtotalCents: number, bags: number) {
  return isFreeShipping(zone, subtotalCents, bags) ? 0 : zoneRate(zone, region);
}
