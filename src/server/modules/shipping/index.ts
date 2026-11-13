import { calculateShipping } from './application/calculate-shipping';
import { listZones } from './application/list-zones';
import { createDrizzleShippingZoneRepository, type Executor } from './infrastructure/drizzle-shipping-zone-repository';

// API pública del módulo shipping. Raíz de composición: aquí se enlaza el repositorio Drizzle.

export type { ShippingQuote } from './application/calculate-shipping';
export type { ZoneSummary } from './application/list-zones';
export type { ShippingZoneRepository } from './application/ports/shipping-zone-repository';
export { calculateShipping } from './application/calculate-shipping';
export { isFreeShipping, servesRegion, shippingCost, zoneRate, type ShippingZone } from './domain/shipping-zone';

/** Casos de uso de envío sobre una conexión o transacción. */
export function shippingFor(executor: Executor) {
  const repository = createDrizzleShippingZoneRepository(executor);
  return { listZones: () => listZones(repository) };
}
