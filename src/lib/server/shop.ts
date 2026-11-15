import { and, asc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { orderItems, orders, products, productVariants } from './db/schema';
import { logger, serializeError } from './logger';

/** Los ids de pedido son UUID aleatorios: funcionan como enlace privado para compras como invitado. */
export function isOrderId(id: string | undefined): id is string {
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Busca el id de un pedido por su número + correo (verificación mínima para que un
 * número correlativo no sirva para ver pedidos ajenos). Para "¿Dónde está mi pedido?".
 */
export async function findOrderIdByNumberAndEmail(number: number, email: string) {
  const [order] = await getDb()
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.number, number), eq(orders.customerEmail, email.trim().toLowerCase())));
  return order?.id;
}

/** Pedido con sus líneas, para la página de confirmación. */
export async function getOrder(id: string) {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order) return undefined;
  const rows = await db.select({ item: orderItems, sku: productVariants.sku }).from(orderItems)
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.id));
  const items = rows.map(row => ({ ...row.item, sku: row.sku }));
  return { ...order, items };
}

/**
 * Precios, moliendas y disponibilidad vigentes para la landing.
 * Devuelve null si la base de datos no responde: la landing usa entonces catalog.json y no se cae.
 */
export async function getLiveCatalog() {
  try {
    const rows = await getDb()
      .select({
        sku: productVariants.sku,
        priceCents: productVariants.priceCents,
        stock: productVariants.stock,
        variantActive: productVariants.active,
        slug: products.slug,
        grinds: products.grinds,
        productActive: products.active
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId));
    return {
      variants: new Map(
        rows.map(row => [row.sku, { price: row.priceCents / 100, available: row.variantActive && row.productActive && row.stock > 0 }])
      ),
      grinds: new Map(rows.map(row => [row.slug, row.grinds]))
    };
  } catch (error) {
    logger.warn('[catalogo] base de datos no disponible; se usa catalog.json', { error: serializeError(error) });
    return null;
  }
}
