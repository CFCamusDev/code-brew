import { asc, desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { InsufficientStockError, inventoryFor } from '../../../server/modules/inventory';
import { unitOfWork } from '../../../server/shared';
import { adminUsers, orders, products, productVariants, stockMovements } from '../db/schema';
import { AdminActionError } from './orders';
import { catalogFor } from '../../../server/modules/catalog';

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
    imageUrl: product.imageUrl,
    active: product.active,
    status: product.status,
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

export async function updateProduct(id: number, data: { name: string; roast: string; grinds: string[]; imageUrl: string | null; active: boolean }) {
  await unitOfWork.run(async tx => {
    const [row] = await tx.select({ status: products.status }).from(products).where(eq(products.id, id)).for('update');
    if (!row) throw new AdminActionError('Producto no encontrado.');
    const { active, ...details } = data;
    await tx.update(products).set(details).where(eq(products.id, id));
    if (active) await catalogFor(tx).changeProductStatus(id, 'active');
    else if (row.status === 'active') await catalogFor(tx).changeProductStatus(id, 'discontinued');
    else await tx.update(products).set({ active: false }).where(eq(products.id, id));
  });
}

export async function updateVariant(id: number, data: { format: string; priceCents: number; bags: number; active: boolean }) {
  const [row] = await getDb().update(productVariants).set(data).where(eq(productVariants.id, id)).returning({ id: productVariants.id });
  if (!row) throw new AdminActionError('Presentación no encontrada.');
}

const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Crea un perfil de café nuevo, con slug único generado del nombre. */
export async function createProduct(data: { name: string; roast: string; grinds: string[]; imageUrl: string | null }) {
  const base = slugify(data.name) || 'cafe';
  const db = getDb();
  let slug = base;
  for (let i = 2; await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).then(rows => rows.length > 0); i++) {
    slug = `${base}-${i}`;
  }
  const [row] = await db
    .insert(products)
    .values({ slug, name: data.name, roast: data.roast, grinds: data.grinds, imageUrl: data.imageUrl, active: false, status: 'draft' })
    .returning({ id: products.id });
  return { id: row.id, slug };
}

/** Agrega una presentación (formato) a un producto ya existente. El SKU se genera del slug + formato. */
export async function createVariant(
  productId: number,
  data: { format: string; priceCents: number; stock: number; bags: number }
) {
  const db = getDb();
  const [product] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, productId));
  if (!product) throw new AdminActionError('Producto no encontrado.');
  const base = `${product.slug}-${slugify(data.format) || 'presentacion'}`;
  let sku = base;
  for (let i = 2; await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.sku, sku)).then(rows => rows.length > 0); i++) {
    sku = `${base}-${i}`;
  }
  const [row] = await db
    .insert(productVariants)
    .values({ productId, sku, format: data.format, priceCents: data.priceCents, stock: data.stock, bags: data.bags })
    .returning({ id: productVariants.id });
  return { id: row.id, sku };
}

/** Suma o resta stock dejando registro del motivo. Nunca deja el stock en negativo. */
export async function adjustStock(
  variantId: number,
  adminUserId: number,
  { delta, reason, note }: { delta: number; reason: 'adjustment' | 'purchase'; note?: string }
) {
  try {
    return await unitOfWork.run(tx => inventoryFor(tx).adjustStock({ variantId, adminUserId, delta, reason, note }));
  } catch (error) {
    if (error instanceof InsufficientStockError) throw new AdminActionError(error.message);
    throw error;
  }
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
