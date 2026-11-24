import { z } from 'zod';

// Contratos del catálogo público (GET /api/catalog/lines/[slug] y GET /api/catalog/products/[slug]).
// Solo productos de líneas publicadas. Un producto «próximamente» muestra únicamente sus campos revelados; precios,
// presentaciones e imágenes aparecen cuando está a la venta.

/** Caché de las respuestas públicas: corta, porque el panel cambia precios y stock; varias visitas seguidas la comparten. */
export const CATALOG_CACHE_CONTROL = 'public, s-maxage=10, stale-while-revalidate=60';

const entrySchema = z.object({ label: z.string(), value: z.string() });

/** Contenido editorial publicado. Cada campo falta si el producto aún no lo revela. */
export const publicProfileSchema = z.object({
  tagline: z.string().optional(),
  method: z.string().optional(),
  description: z.string().optional(),
  notes: z.array(z.string()).optional(),
  facts: z.array(entrySchema).optional(),
  cupProfile: z.array(z.object({ attribute: z.string(), level: z.number() })).optional(),
  recipeFor: z.string().optional(),
  recipe: z.array(entrySchema).optional()
});

const colorsSchema = z.object({ color: z.string().optional(), tint: z.string().optional(), glow: z.string().optional() });

export const publicVariantSchema = z.object({
  sku: z.string(),
  format: z.string(),
  priceCents: z.number().int(),
  /** Un pack está disponible si cada componente tiene stock para la cantidad que lleva (ADR 0003). */
  available: z.boolean(),
  /** Contenido del pack; vacío si no es un pack. */
  components: z.array(z.object({ name: z.string(), format: z.string(), quantity: z.number().int() }))
});

export const publicProductSchema = z.object({
  slug: z.string(),
  name: z.string(),
  releaseNumber: z.number().int().nullable(),
  status: z.enum(['upcoming', 'active']),
  kind: z.enum(['product', 'pack']),
  launchAt: z.string().nullable(),
  line: z.object({ slug: z.string(), name: z.string() }),
  colors: colorsSchema,
  profile: publicProfileSchema,
  /** Solo a la venta. */
  roast: z.string().nullable(),
  grinds: z.array(z.string()),
  variants: z.array(publicVariantSchema),
  media: z.array(z.object({ view: z.string(), url: z.string(), alt: z.string() }))
});
export type PublicProduct = z.infer<typeof publicProductSchema>;

/** Producto dentro de la página de su línea: lo justo para la tarjeta. */
export const publicProductSummarySchema = publicProductSchema.pick({ slug: true, name: true, releaseNumber: true, status: true, colors: true }).extend({
  tagline: z.string().optional(),
  /** Precio de la presentación más barata disponible; null si no está a la venta. */
  fromPriceCents: z.number().int().nullable()
});
export type PublicProductSummary = z.infer<typeof publicProductSummarySchema>;

export const publicLineSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  theme: z.record(z.string(), z.string()),
  template: z.string(),
  products: z.array(publicProductSummarySchema)
});
export type PublicLine = z.infer<typeof publicLineSchema>;
