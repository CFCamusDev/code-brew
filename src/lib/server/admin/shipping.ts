import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { shippingRegionRates, shippingZones } from '../db/schema';
import { AdminActionError } from './orders';

export async function listShipping() {
  const db = getDb();
  const [zones, rates] = await Promise.all([
    db.select().from(shippingZones).orderBy(asc(shippingZones.sortOrder)),
    db.select().from(shippingRegionRates).orderBy(asc(shippingRegionRates.region))
  ]);
  return zones.map(zone => ({
    id: zone.id,
    slug: zone.slug,
    name: zone.name,
    eta: zone.eta,
    priceCents: zone.priceCents,
    freeFromBags: zone.freeFromBags,
    freeFromCents: zone.freeFromCents,
    regions: zone.regions,
    active: zone.active,
    rates: rates.filter(rate => rate.zoneId === zone.id).map(rate => ({ id: rate.id, region: rate.region, priceCents: rate.priceCents }))
  }));
}
export type AdminZone = Awaited<ReturnType<typeof listShipping>>[number];

export async function updateZone(
  id: number,
  data: { name: string; eta: string; priceCents: number; freeFromBags: number | null; freeFromCents: number | null; active: boolean }
) {
  const [row] = await getDb().update(shippingZones).set(data).where(eq(shippingZones.id, id)).returning({ id: shippingZones.id });
  if (!row) throw new AdminActionError('Zona no encontrada.');
}

export async function upsertRegionRate(zoneId: number, region: string, priceCents: number) {
  const db = getDb();
  const [zone] = await db.select({ regions: shippingZones.regions }).from(shippingZones).where(eq(shippingZones.id, zoneId));
  if (!zone) throw new AdminActionError('Zona no encontrada.');
  if (zone.regions && !zone.regions.includes(region)) throw new AdminActionError(`Esta zona no atiende ${region}.`);
  await db
    .insert(shippingRegionRates)
    .values({ zoneId, region, priceCents })
    .onConflictDoUpdate({ target: [shippingRegionRates.zoneId, shippingRegionRates.region], set: { priceCents } });
}

export async function deleteRegionRate(zoneId: number, region: string) {
  await getDb()
    .delete(shippingRegionRates)
    .where(and(eq(shippingRegionRates.zoneId, zoneId), eq(shippingRegionRates.region, region)));
}
