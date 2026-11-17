import { z } from 'zod';

const details = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre.').max(80),
  roast: z.string().trim().min(1, 'Indica el tueste.').max(80),
  grinds: z.array(z.string().trim().min(1).max(80)).min(1, 'Deja al menos una molienda.').max(10),
  imageUrl: z.string().trim().max(500).nullable()
});
const metadata = z.object({
  lineId: z.number().int().positive().max(2147483647).nullable(),
  tagline: z.string().trim().max(160),
  releaseNumber: z.number().int().positive().max(2147483647).nullable(),
  launchAt: z.iso.datetime({ offset: true }).nullable(),
  status: z.enum(['draft', 'upcoming', 'active', 'discontinued'])
});
export const createProductInput = details.extend({
  lineId: metadata.shape.lineId.default(null),
  tagline: metadata.shape.tagline.default(''),
  releaseNumber: metadata.shape.releaseNumber.default(null),
  launchAt: metadata.shape.launchAt.default(null),
  status: z.enum(['draft', 'upcoming', 'active']).default('draft')
}).strict();
export const editProductInput = z.union([
  details.extend({ active: z.boolean() }).strict(),
  details.extend(metadata.shape).strict()
]);
export type CreateProductInput = z.infer<typeof createProductInput>;
export type EditProductInput = z.infer<typeof editProductInput>;
