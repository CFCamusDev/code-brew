import { and, count, eq, inArray, sql } from 'drizzle-orm';
import type { Transaction } from '../../../shared/unit-of-work';
import { productLines, productMedia, productProfiles, products, productVariants } from '../../../../lib/server/db/schema';
import type { LineRepository, ProductRepository } from '../application/ports/catalog-repositories';

/** Líneas sobre la transacción del llamador. */
export function createDrizzleLineRepository(tx: Transaction): LineRepository {
  return {
    async lockLine(lineId) {
      const [line] = await tx
        .select({ id: productLines.id, slug: productLines.slug, name: productLines.name, status: productLines.status })
        .from(productLines)
        .where(eq(productLines.id, lineId))
        .for('update');
      return line ?? null;
    },
    async countPublishableProducts(lineId) {
      const [row] = await tx
        .select({ total: count() })
        .from(products)
        .where(and(eq(products.lineId, lineId), inArray(products.status, ['upcoming', 'active'])));
      return row.total;
    },
    async updateStatus(lineId, status) {
      await tx.update(productLines).set({ status }).where(eq(productLines.id, lineId));
    }
  };
}

/** Productos, con su perfil, imágenes y presentaciones, sobre la transacción del llamador. */
export function createDrizzleProductRepository(tx: Transaction): ProductRepository {
  return {
    async lockForPublication(productId) {
      const [product] = await tx
        .select({ id: products.id, status: products.status, lineId: products.lineId, imageUrl: products.imageUrl })
        .from(products)
        .where(eq(products.id, productId))
        .for('update');
      if (!product) return null;
      const [[profile], [media], variants] = await Promise.all([
        tx
          .select({ tagline: productProfiles.tagline, method: productProfiles.method, description: productProfiles.description })
          .from(productProfiles)
          .where(eq(productProfiles.productId, productId)),
        tx.select({ total: count() }).from(productMedia).where(and(eq(productMedia.productId, productId), eq(productMedia.view, 'front'), sql`length(trim(${productMedia.url})) > 0`)),
        tx.select({ active: productVariants.active, priceCents: productVariants.priceCents }).from(productVariants).where(eq(productVariants.productId, productId))
      ]);
      return {
        id: product.id,
        status: product.status,
        lineId: product.lineId,
        profile: profile ?? null,
        // La imagen única del catálogo anterior (Cloudinary) cuenta mientras se migra a product_media.
        imageCount: media.total + (product.imageUrl?.trim() ? 1 : 0),
        variants
      };
    },
    async updateStatus(productId, status, launchedAt) {
      await tx
        .update(products)
        .set({
          status,
          active: status === 'active',
          // Solo el primer lanzamiento fija la fecha; relanzar un descontinuado la conserva.
          ...(launchedAt ? { launchAt: sql`coalesce(${products.launchAt}, ${launchedAt.toISOString()}::timestamptz)` } : {})
        })
        .where(eq(products.id, productId));
    }
  };
}
