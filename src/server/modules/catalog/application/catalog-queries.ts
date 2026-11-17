import { isPubliclyVisible, revealProfile, type PublicProfile } from '../domain/catalog';
import type { CatalogReader, LineRecord, ProductRecord } from './ports/catalog-reader';

// Consultas públicas del catálogo. Devuelven null cuando el público no debe ver la línea o el producto, para que el
// endpoint responda 404 sin distinguir «no existe» de «todavía no se publica».

export interface PublicVariant {
  sku: string;
  format: string;
  priceCents: number;
  available: boolean;
}

export interface PublicProductView {
  slug: string;
  name: string;
  releaseNumber: number | null;
  status: 'upcoming' | 'active';
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
    launchAt: product.launchAt?.toISOString() ?? null,
    line: { slug: line.slug, name: line.name },
    colors: product.profile?.colors ?? {},
    profile: revealProfile(status, product.profile, product.profile?.revealedFields ?? []),
    roast: onSale ? product.roast : null,
    grinds: onSale ? product.grinds : [],
    variants: onSale
      ? product.variants.filter(variant => variant.active).map(({ sku, format, priceCents, stock }) => ({ sku, format, priceCents, available: stock > 0 }))
      : [],
    media: onSale ? product.media : []
  };
}

/** Caso de uso VerProducto. */
export async function getPublicProduct(reader: CatalogReader, slug: string): Promise<PublicProductView | null> {
  const found = await reader.findProduct(slug);
  return found ? toPublicProduct(found.line, found.product) : null;
}

/** Caso de uso VerLinea: la línea publicada con sus productos visibles, en orden de lanzamiento. */
export async function getPublicLine(reader: CatalogReader, slug: string) {
  const found = await reader.findLine(slug);
  if (!found || found.line.status !== 'active') return null;
  const { line } = found;
  const products = found.products
    .map(product => toPublicProduct(line, product))
    .filter((product): product is PublicProductView => product !== null)
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
