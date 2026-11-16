import { z } from 'zod';
import { adminAction } from '../../../../lib/server/admin/api';
import { deleteRegionRate, updateZone, upsertRegionRate } from '../../../../lib/server/admin/shipping';
import { REGIONS } from '../../../../contracts/checkout';

export const prerender = false;

const cents = z.number().int().min(0).max(100_000);
const region = z.enum(REGIONS, 'Departamento inválido.');

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('zone'),
    zoneId: z.number().int().positive(),
    name: z.string().trim().min(1).max(80),
    eta: z.string().trim().min(1).max(80),
    priceCents: cents,
    freeFromBags: z.number().int().min(1).max(50).nullable(),
    freeFromCents: cents.nullable(),
    active: z.boolean()
  }),
  z.object({ action: z.literal('rate'), zoneId: z.number().int().positive(), region, priceCents: cents }),
  z.object({ action: z.literal('delete-rate'), zoneId: z.number().int().positive(), region })
]);

export const POST = adminAction(
  bodySchema,
  async body => {
    if (body.action === 'zone') {
      const { action, zoneId, ...data } = body;
      await updateZone(zoneId, data);
    } else if (body.action === 'rate') {
      await upsertRegionRate(body.zoneId, body.region, body.priceCents);
    } else {
      await deleteRegionRate(body.zoneId, body.region);
    }
  },
  { adminOnly: true }
);
