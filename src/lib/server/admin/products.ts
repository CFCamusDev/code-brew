import { asc, desc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { InsufficientStockError, inventoryFor } from '../../../server/modules/inventory';
import { unitOfWork } from '../../../server/shared';
import { adminUsers, orders, products, productVariants, stockMovements, productProfiles, productLines } from '../db/schema';
import { AdminActionError } from './orders';
import type { CreateProductInput, EditProductInput } from '../../../contracts/admin-products';
import { ConflictError, NotFoundError } from '../../../server/shared/errors';
import { catalogFor } from '../../../server/modules/catalog';

export async function listProducts() {
  const db = getDb();
  const [productRows, variantRows, profiles] = await Promise.all([
    db.select().from(products).orderBy(asc(products.sortOrder)),
    db.select().from(productVariants).orderBy(asc(productVariants.id)),
    db.select({ productId: productProfiles.productId, tagline: productProfiles.tagline }).from(productProfiles)
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
    lineId: product.lineId,
    tagline: profiles.find(profile => profile.productId === product.id)?.tagline ?? '',
    releaseNumber: product.releaseNumber,
    launchAt: product.launchAt?.toISOString() ?? null,
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

async function productConflict<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause.code === '23505' || cause.cause?.code === '23505') throw new ConflictError('Ya existe ese slug o número de entrega en la línea.');
    throw error;
  }
}

export async function updateProduct(id: number, data: EditProductInput) {
  return productConflict(() => unitOfWork.run(async tx => {
    const [row] = await tx.select({ status: products.status, launchAt: products.launchAt }).from(products).where(eq(products.id, id)).for('update');
    if (!row) throw new AdminActionError('Producto no encontrado.');
    if ('active' in data) {
      const { active, ...details } = data;
      await tx.update(products).set(details).where(eq(products.id, id));
      if (active) await catalogFor(tx).changeProductStatus(id, 'active');
      else if (row.status === 'active') await catalogFor(tx).changeProductStatus(id, 'discontinued');
      else await tx.update(products).set({ active: false }).where(eq(products.id, id));
      return;
    }
    if (data.lineId !== null) {
      const [line] = await tx.select({ id: productLines.id }).from(productLines).where(eq(productLines.id, data.lineId)).for('share');
      if (!line) throw new NotFoundError('Línea no encontrada.');
    }
    const { status, tagline, launchAt, ...details } = data;
    const nextLaunch = launchAt ? new Date(launchAt) : null;
    if (row.status === 'active' || row.status === 'discontinued') {
      if (nextLaunch?.getTime() !== row.launchAt?.getTime()) throw new ConflictError('La fecha del primer lanzamiento se conserva después de activar el producto.');
    }
    await tx.update(products).set({ ...details, launchAt: nextLaunch }).where(eq(products.id, id));
    await tx.insert(productProfiles).values({ productId: id, tagline, revealedFields: ['tagline'] }).onConflictDoUpdate({ target: productProfiles.productId, set: { tagline } });
    await catalogFor(tx).changeProductStatus(id, status);
    await tx.update(products).set({ status, active: status === 'active' }).where(eq(products.id, id));
  }));
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
export async function createProduct(data: CreateProductInput) {
  const base = slugify(data.name) || 'cafe';
  return productConflict(() => unitOfWork.run(async tx => {
    if (data.lineId !== null) {
      const [line] = await tx.select({ id: productLines.id }).from(productLines).where(eq(productLines.id, data.lineId)).for('share');
      if (!line) throw new NotFoundError('Línea no encontrada.');
    }
    let slug = base;
    for (let i = 2; (await tx.select({ id: products.id }).from(products).where(eq(products.slug, slug))).length; i++) slug = `${base}-${i}`;
    const { tagline, status, launchAt, ...details } = data;
    const [row] = await tx.insert(products).values({ ...details, slug, active: false, status: 'draft', launchAt: launchAt ? new Date(launchAt) : null }).returning({ id: products.id });
    if (tagline) await tx.insert(productProfiles).values({ productId: row.id, tagline, revealedFields: ['tagline'] });
    await catalogFor(tx).changeProductStatus(row.id, status);
    return { id: row.id, slug };
  }));
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
