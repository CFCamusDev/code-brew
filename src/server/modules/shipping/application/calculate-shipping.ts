import { servesRegion, shippingCost, type ShippingZone } from '../domain/shipping-zone';

export type ShippingQuote =
  | { status: 'ok'; zone: ShippingZone; shippingCents: number }
  /** Sin zona elegida o inexistente: el envío no se puede calcular todavía. */
  | { status: 'no_zone' }
  | { status: 'region_not_served'; zone: ShippingZone; message: string };

/** Caso de uso CalcularEnvio, sobre las zonas ya cargadas. */
export function calculateShipping(
  zones: ShippingZone[],
  input: { zoneSlug?: string; region?: string; subtotalCents: number; bags: number }
): ShippingQuote {
  const zone = zones.find(candidate => candidate.slug === input.zoneSlug);
  if (!zone) return { status: 'no_zone' };
  if (!servesRegion(zone, input.region)) {
    return { status: 'region_not_served', zone, message: `${zone.name} no atiende ${input.region}. Elige otra zona de envío.` };
  }
  return { status: 'ok', zone, shippingCents: shippingCost(zone, input.region, input.subtotalCents, input.bags) };
}
