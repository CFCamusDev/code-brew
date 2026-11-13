import { asc, eq } from 'drizzle-orm';
import { getDb } from '../../../../lib/server/db';
import { shippingRegionRates, shippingZones } from '../../../../lib/server/db/schema';
import type { ShippingZoneRepository } from '../application/ports/shipping-zone-repository';

type Db = ReturnType<typeof getDb>;
/** Conexión o transacción abierta: así el cálculo corre dentro de la transacción del llamador. */
export type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export function createDrizzleShippingZoneRepository(db: Executor): ShippingZoneRepository {
  return {
    async listActive() {
      const [zones, rates] = await Promise.all([
        db.select().from(shippingZones).where(eq(shippingZones.active, true)).orderBy(asc(shippingZones.sortOrder)),
        db
          .select({ zoneId: shippingRegionRates.zoneId, region: shippingRegionRates.region, priceCents: shippingRegionRates.priceCents })
          .from(shippingRegionRates)
      ]);
      return zones.map(zone => ({
        slug: zone.slug,
        name: zone.name,
        eta: zone.eta,
        priceCents: zone.priceCents,
        freeFromCents: zone.freeFromCents,
        freeFromBags: zone.freeFromBags,
        regions: zone.regions,
        regionRates: rates.filter(rate => rate.zoneId === zone.id).map(({ region, priceCents }) => ({ region, priceCents }))
      }));
    }
  };
}
