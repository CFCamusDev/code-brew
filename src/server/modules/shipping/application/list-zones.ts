import type { ShippingZone } from '../domain/shipping-zone';
import type { ShippingZoneRepository } from './ports/shipping-zone-repository';

/** Zona tal como la ve el checkout: sin el detalle de tarifas, solo si tiene tarifas distintas por departamento. */
export type ZoneSummary = Omit<ShippingZone, 'regionRates'> & { hasRegionRates: boolean };

/** Caso de uso ListarZonas. */
export async function listZones(repository: ShippingZoneRepository): Promise<{ summaries: ZoneSummary[]; zones: ShippingZone[] }> {
  const zones = await repository.listActive();
  const summaries = zones.map(({ regionRates, ...zone }) => ({ ...zone, hasRegionRates: regionRates.length > 0 }));
  return { summaries, zones };
}
