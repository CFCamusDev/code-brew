import { asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { adminUsers, orders, products, productVariants, stockMovements } from '../db/schema';
import { AdminActionError } from './orders';

export async function listProducts() {
  const db = getDb();
  const [productRows, variantRows] = await Promise.all([
    db.select().from(products).orderBy(asc(products.sortOrder)),
    db.select().from(productVariants).orderBy(asc(productVariants.id))
  ]);
  return productRows.map(product => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    roast: product.roast,
    grinds: product.grinds,
    active: product.active,
    variants: variantRows
      .filter(variant => variant.productId === product.id)
      .map(variant => ({
        id: variant.id,
        sku: variant.sku,
        format: variant.format,
        priceCents: variant.priceCents,
        stock: variant.stock,
        bags: variant.bags,
        active: variant.active
      }))
  }));
}
export type AdminProduct = Awaited<ReturnType<typeof listProducts>>[number];

export async function updateProduct(id: number, data: { name: string; roast: string; grinds: string[]; active: boolean }) {
  const [row] = await getDb().update(products).set(data).where(eq(products.id, id)).returning({ id: products.id });
  if (!row) throw new AdminActionError('Producto no encontrado.');
}

export async function updateVariant(id: number, data: { format: string; priceCents: number; bags: number; active: boolean }) {
  const [row] = await getDb().update(productVariants).set(data).where(eq(productVariants.id, id)).returning({ id: productVariants.id });
  if (!row) throw new AdminActionError('Presentación no encontrada.');
}

/** Suma o resta stock dejando registro del motivo. Nunca deja el stock en negativo. */
export async function adjustStock(
  variantId: number,
  adminUserId: number,
  { delta, reason, note }: { delta: number; reason: 'adjustment' | 'purchase'; note?: string }
) {
  return getDb().transaction(async tx => {
    const [variant] = await tx
      .update(productVariants)
      .set({ stock: sql`${productVariants.stock} + ${delta}` })
      .where(sql`${productVariants.id} = ${variantId} and ${productVariants.stock} + ${delta} >= 0`)
      .returning({ stock: productVariants.stock });
    if (!variant) throw new AdminActionError('El ajuste dejaría el stock en negativo.');
    await tx.insert(stockMovements).values({ variantId, delta, stockAfter: variant.stock, reason, adminUserId, note: note || null });
    return variant.stock;
  });
}

export async function recentStockMovements(limit = 40) {
  return getDb()
    .select({
      id: stockMovements.id,
      sku: productVariants.sku,
      format: productVariants.format,
      productName: products.name,
      delta: stockMovements.delta,
      stockAfter: stockMovements.stockAfter,
      reason: stockMovements.reason,
      note: stockMovements.note,
      orderId: stockMovements.orderId,
      orderNumber: orders.number,
      adminName: adminUsers.name,
      createdAt: stockMovements.createdAt
    })
    .from(stockMovements)
    .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(orders, eq(orders.id, stockMovements.orderId))
    .leftJoin(adminUsers, eq(adminUsers.id, stockMovements.adminUserId))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(limit);
}
