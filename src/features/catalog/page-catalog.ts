import { CATALOG_SOURCE } from 'astro:env/server';
import catalog from '../../data/catalog.json';
import { PIPELINE, type PipelineProduct } from '../../data/pipeline';
import { logger, serializeError } from '../../lib/server/logger';
import { getLiveCatalog } from '../../lib/server/shop';
import { findPublicLineProducts, findPublicProduct, type PublicProductView } from '../../server/modules/catalog';

// Catálogo para las páginas del sitio (S5.3). Con CATALOG_SOURCE=db sale del catálogo del panel (solo lo publicado y lo
// revelado); con static, de pipeline.json y catalog.json como antes. Las dos fuentes se convierten a la misma forma para
// que la portada y la página de producto no sepan de dónde vienen los datos.

export const PIPELINE_LINE = 'pipeline';

/** Línea con su identidad (ADR 0004): theme son variables CSS y template elige la plantilla de src/lines. */
export interface CatalogLine {
  slug: string;
  name: string;
  description: string | null;
  theme: Record<string, string>;
  template: string;
}

/** Pipeline en el modo estático: sin tema propio (sus colores están en brand.css) y con su plantilla. */
export const STATIC_PIPELINE_LINE: CatalogLine = {
  slug: PIPELINE_LINE,
  name: 'Pipeline',
  description: 'Cinco perfiles de café de especialidad, uno para cada etapa del desarrollo.',
  theme: {},
  template: 'pipeline'
};

export interface Entry {
  label: string;
  value: string;
}

/** Perfil de un producto tal como lo pintan la portada y su página. Lo no revelado falta o viene vacío. */
export interface CatalogProfile {
  slug: string;
  name: string;
  /** Número de lanzamiento con dos cifras («01»); vacío si no tiene. */
  num: string;
  available: boolean;
  colors: { color?: string; tint?: string; glow?: string };
  tagline?: string;
  method?: string;
  roast?: string;
  description?: string;
  notes: string[];
  facts: Entry[];
  cupProfile: { attribute: string; level: number }[];
  recipeFor?: string;
  recipe: Entry[];
  /** Imágenes del producto a la venta (la plantilla base las usa; Pipeline pinta sus bolsas). */
  media: { view: string; url: string; alt: string }[];
}

/** Lo que se puede comprar: precios en soles. */
export interface CatalogOffer {
  variants: { sku: string; format: string; price: number; available: boolean }[];
  grinds: string[];
}

export interface ProductPage {
  line: CatalogLine;
  product: CatalogProfile;
  offer: CatalogOffer;
  /** Todos los perfiles de su línea, en orden de lanzamiento, para el selector. */
  siblings: CatalogProfile[];
}

const entries = (pairs: (string | number)[][]): Entry[] => pairs.map(([label, value]) => ({ label: String(label), value: String(value) }));

/** pipeline.json → perfil. */
export function fromStatic(product: PipelineProduct): CatalogProfile {
  return {
    slug: product.slug,
    name: product.name,
    num: product.num,
    available: product.status === 'available',
    colors: { color: product.color, tint: product.tint, glow: product.glow },
    tagline: product.tagline,
    method: product.method,
    roast: product.roast,
    description: product.description ?? undefined,
    notes: product.notes,
    facts: entries(product.facts),
    cupProfile: product.profile.map(([attribute, level]) => ({ attribute: String(attribute), level: Number(level) })),
    recipeFor: product.recipeFor,
    recipe: entries(product.recipe),
    media: []
  };
}

/** Vista pública del catálogo → perfil. */
export function fromCatalog(product: PublicProductView): CatalogProfile {
  const { profile } = product;
  return {
    slug: product.slug,
    name: product.name,
    num: product.releaseNumber === null ? '' : String(product.releaseNumber).padStart(2, '0'),
    available: product.status === 'active',
    colors: product.colors,
    tagline: profile.tagline,
    method: profile.method,
    roast: product.roast ?? undefined,
    description: profile.description,
    notes: profile.notes ?? [],
    facts: profile.facts ?? [],
    cupProfile: profile.cupProfile ?? [],
    recipeFor: profile.recipeFor,
    recipe: profile.recipe ?? [],
    media: product.media
  };
}

/** Vista pública del catálogo → oferta. */
export function offerFromCatalog(product: PublicProductView): CatalogOffer {
  return {
    variants: product.variants.map(({ sku, format, priceCents, available }) => ({ sku, format, price: priceCents / 100, available })),
    grinds: product.grinds
  };
}

/** Oferta del modo estático: presentaciones de catalog.json con el precio y el stock de la base si responde. */
async function staticOffer(slug: string): Promise<CatalogOffer> {
  const live = await getLiveCatalog();
  const fallback = catalog.products.find(product => product.slug === slug);
  const known = fallback?.variants ?? [];
  // Un lanzamiento sin entrada en catalog.json usa sus SKU de la base (<slug>-250 / <slug>-500).
  const base = known.length
    ? known
    : [...(live?.variants.keys() ?? [])]
        .filter(sku => sku.startsWith(slug + '-') && /-(250|500)$/.test(sku))
        .map(sku => ({ sku, format: sku.endsWith('-500') ? '500 g' : '250 g', price: live!.variants.get(sku)!.price }));
  return {
    variants: base.map(variant => ({
      sku: variant.sku,
      format: variant.format,
      price: live?.variants.get(variant.sku)?.price ?? variant.price,
      available: live ? (live.variants.get(variant.sku)?.available ?? false) : true
    })),
    grinds: live?.grinds.get(slug) ?? fallback?.grinds ?? []
  };
}

/** Lee del catálogo en base de datos; si falla, avisa en los logs y devuelve null para usar el estático. */
async function fromDatabase<T>(read: () => Promise<T>): Promise<{ value: T } | null> {
  if (CATALOG_SOURCE === 'static') return null;
  try {
    return { value: await read() };
  } catch (error) {
    logger.warn('[catalogo] no se pudo leer el catálogo de la base; se usa el estático', { error: serializeError(error) });
    return null;
  }
}

/** Una línea publicada con sus perfiles visibles, en orden de lanzamiento; null si no se publica. */
export async function getLineCatalog(lineSlug = PIPELINE_LINE): Promise<{ line: CatalogLine; products: CatalogProfile[] } | null> {
  const found = await fromDatabase(() => findPublicLineProducts(lineSlug));
  if (found) return found.value && { line: found.value.line, products: found.value.products.map(fromCatalog) };
  return lineSlug === PIPELINE_LINE ? { line: STATIC_PIPELINE_LINE, products: PIPELINE.map(fromStatic) } : null;
}

/** Datos de la página de un producto; null si no existe o el público no debe verlo. */
export async function getProductPage(slug: string): Promise<ProductPage | null> {
  const found = await fromDatabase(async () => {
    const product = await findPublicProduct(slug);
    if (!product) return null;
    const line = await findPublicLineProducts(product.line.slug);
    if (!line) return null;
    return { line: line.line, product: fromCatalog(product), offer: offerFromCatalog(product), siblings: line.products.map(fromCatalog) };
  });
  if (found) return found.value;
  const product = PIPELINE.find(candidate => candidate.slug === slug);
  if (!product) return null;
  return { line: STATIC_PIPELINE_LINE, product: fromStatic(product), offer: await staticOffer(product.catalogSlug), siblings: PIPELINE.map(fromStatic) };
}
