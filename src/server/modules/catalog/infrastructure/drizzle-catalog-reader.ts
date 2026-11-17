import { asc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { getDb } from '../../../../lib/server/db';
import { bundleItems, productLines, productMedia, productProfiles, products, productVariants } from '../../../../lib/server/db/schema';
import type { CatalogReader, LineRecord, ProductRecord } from '../application/ports/catalog-reader';

type Db = ReturnType<typeof getDb>;
const bundleVariant = alias(productVariants, 'bundle_variant');
const componentVariant = alias(productVariants, 'component_variant');
/** Fila de products con la línea, antes de completarla. */
type ProductRow = Omit<ProductRecord, 'profile' | 'media' | 'variants'> & { lineId: number | null };

const lineColumns = {
  id: productLines.id,
  slug: productLines.slug,
  name: productLines.name,
  description: productLines.description,
  status: productLines.status,
  theme: productLines.theme,
  template: productLines.template
};

const productColumns = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  releaseNumber: products.releaseNumber,
  status: products.status,
  launchAt: products.launchAt,
  roast: products.roast,
  grinds: products.grinds,
  lineId: products.lineId
};

/** Lector del catálogo sobre la conexión (sin transacción: solo lee). */
export function createDrizzleCatalogReader(getDatabase: () => Db): CatalogReader {
  /** Completa los productos con su perfil, imágenes, presentaciones y componentes de packs en cuatro consultas. */
  async function hydrate(rows: ProductRow[]): Promise<ProductRecord[]> {
    if (!rows.length) return [];
    const db = getDatabase();
    const ids = rows.map(row => row.id);
    const [profiles, media, variants, components] = await Promise.all([
      db.select().from(productProfiles).where(inArray(productProfiles.productId, ids)),
      db
        .select({ productId: productMedia.productId, view: productMedia.view, url: productMedia.url, alt: productMedia.alt })
        .from(productMedia)
        .where(inArray(productMedia.productId, ids))
        .orderBy(asc(productMedia.sortOrder), asc(productMedia.id)),
      db
        .select({
          id: productVariants.id,
          productId: productVariants.productId,
          sku: productVariants.sku,
          format: productVariants.format,
          priceCents: productVariants.priceCents,
          stock: productVariants.stock,
          active: productVariants.active
        })
        .from(productVariants)
        .where(inArray(productVariants.productId, ids))
        .orderBy(asc(productVariants.priceCents), asc(productVariants.id)),
      db
        .select({
          bundleVariantId: bundleItems.bundleVariantId,
          productName: products.name,
          productActive: products.active,
          format: componentVariant.format,
          quantity: bundleItems.quantity,
          stock: componentVariant.stock,
          variantActive: componentVariant.active
        })
        .from(bundleItems)
        .innerJoin(bundleVariant, eq(bundleVariant.id, bundleItems.bundleVariantId))
        .innerJoin(componentVariant, eq(componentVariant.id, bundleItems.componentVariantId))
        .innerJoin(products, eq(products.id, componentVariant.productId))
        .where(inArray(bundleVariant.productId, ids))
        .orderBy(asc(products.sortOrder), asc(componentVariant.priceCents))
    ]);
    return rows.map(({ lineId: _lineId, ...row }) => {
      const profile = profiles.find(candidate => candidate.productId === row.id);
      return {
        ...row,
        profile: profile
          ? {
              tagline: profile.tagline,
              method: profile.method,
              description: profile.description,
              notes: profile.notes,
              facts: profile.facts,
              cupProfile: profile.cupProfile,
              recipeFor: profile.recipeFor,
              recipe: profile.recipe,
              colors: profile.colors,
              revealedFields: profile.revealedFields
            }
          : null,
        media: media.filter(item => item.productId === row.id).map(({ productId: _id, ...item }) => item),
        variants: variants
          .filter(item => item.productId === row.id)
          .map(({ productId: _product, id, ...item }) => ({
            ...item,
            components: components
              .filter(component => component.bundleVariantId === id)
              .map(({ productName, format, quantity, stock, productActive, variantActive }) => ({
                productName,
                format,
                quantity,
                stock,
                active: productActive && variantActive
              }))
          }))
      };
    });
  }

  function selectProducts(where: ReturnType<typeof eq>): Promise<ProductRow[]> {
    return getDatabase()
      .select(productColumns)
      .from(products)
      .where(where)
      .orderBy(asc(products.releaseNumber), asc(products.sortOrder), asc(products.id));
  }

  return {
    async findLine(slug) {
      const [line] = await getDatabase().select(lineColumns).from(productLines).where(eq(productLines.slug, slug));
      if (!line) return null;
      return { line: line as LineRecord, products: await hydrate(await selectProducts(eq(products.lineId, line.id))) };
    },
    async listActiveLines() {
      const lines = await getDatabase()
        .select(lineColumns)
        .from(productLines)
        .where(eq(productLines.status, 'active'))
        .orderBy(asc(productLines.sortOrder), asc(productLines.id));
      if (!lines.length) return [];
      const rows = await getDatabase()
        .select(productColumns)
        .from(products)
        .where(inArray(products.lineId, lines.map(line => line.id)))
        .orderBy(asc(products.releaseNumber), asc(products.sortOrder), asc(products.id));
      const hydrated = await hydrate(rows);
      return lines.map(line => ({
        line: line as LineRecord,
        products: hydrated.filter((_, index) => rows[index].lineId === line.id)
      }));
    },
    async findProduct(slug) {
      const [row] = await selectProducts(eq(products.slug, slug));
      if (!row?.lineId) return null;
      const [line] = await getDatabase().select(lineColumns).from(productLines).where(eq(productLines.id, row.lineId));
      if (!line) return null;
      const [product] = await hydrate([row]);
      return { line: line as LineRecord, product };
    }
  };
}
