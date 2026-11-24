import { isPubliclyVisible, isVariantAvailable, revealProfile, type PublicProfile } from '../domain/catalog';
import type { CatalogReader, LineRecord, ProductRecord } from './ports/catalog-reader';

// Consultas públicas del catálogo. Devuelven null cuando el público no debe ver la línea o el producto, para que el
// endpoint responda 404 sin distinguir «no existe» de «todavía no se publica».

export interface PublicVariant {
  sku: string;
  format: string;
  priceCents: number;
  available: boolean;
  /** Contenido del pack («2 × Hotfix 250 g»); vacío si no es un pack. */
  components: { name: string; format: string; quantity: number }[];
}

export interface PublicProductView {
  slug: string;
  name: string;
  releaseNumber: number | null;
  status: 'upcoming' | 'active';
  /** pack si alguna de sus presentaciones se arma con otras (bundle_items). */
  kind: 'product' | 'pack';
  launchAt: string | null;
  line: { slug: string; name: string };
  colors: { color?: string; tint?: string; glow?: string };
  profile: PublicProfile;
  roast: string | null;
  grinds: string[];
  variants: PublicVariant[];
  media: { view: string; url: string; alt: string }[];
}

function toPublicProduct(line: LineRecord, product: ProductRecord): PublicProductView | null {
  if (!isPubliclyVisible(product.status, line.status)) return null;
  const status = product.status;
  const onSale = status === 'active';
  return {
    slug: product.slug,
    name: product.name,
    releaseNumber: product.releaseNumber,
    status,
    kind: product.variants.some(variant => variant.components.length > 0) ? 'pack' : 'product',
    launchAt: product.launchAt?.toISOString() ?? null,
    line: { slug: line.slug, name: line.name },
    colors: product.profile?.colors ?? {},
    profile: revealProfile(status, product.profile, product.profile?.revealedFields ?? []),
    roast: onSale ? product.roast : null,
    grinds: onSale ? product.grinds : [],
    variants: onSale
      ? product.variants
          .filter(variant => variant.active)
          .map(variant => ({
            sku: variant.sku,
            format: variant.format,
            priceCents: variant.priceCents,
            available: isVariantAvailable(variant),
            components: variant.components.map(({ productName, format, quantity }) => ({ name: productName, format, quantity }))
          }))
      : [],
    media: onSale ? product.media : []
  };
}

/** Caso de uso VerProducto. */
export async function getPublicProduct(reader: CatalogReader, slug: string): Promise<PublicProductView | null> {
  const found = await reader.findProduct(slug);
  return found ? toPublicProduct(found.line, found.product) : null;
}

/** La línea publicada con la vista completa de sus productos visibles, en orden de lanzamiento (páginas del sitio). */
export async function getPublicLineProducts(reader: CatalogReader, slug: string) {
  const found = await reader.findLine(slug);
  if (!found || found.line.status !== 'active') return null;
  const { line } = found;
  const products = found.products
    .map(product => toPublicProduct(line, product))
    .filter((product): product is PublicProductView => product !== null);
  return { line, products };
}

/** Caso de uso VerTienda: las líneas publicadas en su orden, cada una con sus productos visibles (sin líneas vacías). */
export async function getPublicLines(reader: CatalogReader) {
  const lines = await reader.listActiveLines();
  return lines
    .map(({ line, products }) => ({
      line,
      products: products.map(product => toPublicProduct(line, product)).filter((product): product is PublicProductView => product !== null)
    }))
    .filter(({ products }) => products.length > 0);
}

/** Caso de uso VerLinea: la línea publicada con sus productos visibles, en orden de lanzamiento. */
export async function getPublicLine(reader: CatalogReader, slug: string) {
  const found = await getPublicLineProducts(reader, slug);
  if (!found) return null;
  const { line } = found;
  const products = found.products
    .map(product => {
      const prices = product.variants.filter(variant => variant.available).map(variant => variant.priceCents);
      return {
        slug: product.slug,
        name: product.name,
        releaseNumber: product.releaseNumber,
        status: product.status,
        colors: product.colors,
        ...(product.profile.tagline ? { tagline: product.profile.tagline } : {}),
        fromPriceCents: prices.length ? Math.min(...prices) : null
      };
    });
  return { slug: line.slug, name: line.name, description: line.description, theme: line.theme, template: line.template, products };
}
