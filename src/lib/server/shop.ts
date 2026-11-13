import { and, asc, eq, inArray } from 'drizzle-orm';
import type { CartLine, Customer, Quote } from '../shop/checkout';
import { isFreeShipping } from '../shop/shipping';
import { getDb } from './db';
import { orderItems, orders, products, productVariants, shippingRegionRates, shippingZones } from './db/schema';
import { logger, serializeError } from './logger';

type Db = ReturnType<typeof getDb>;
type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/** El carrito no se puede comprar tal como está (stock, molienda o producto inactivo). */
export class CartIssuesError extends Error {
  constructor(public issues: Quote['issues']) {
    super('El carrito tiene productos no disponibles');
  }
}

/**
 * Calcula precios, envío y total con los datos vigentes de la base de datos.
 * Nunca usa precios enviados por el navegador.
 */
export async function quoteCart(db: Executor, items: CartLine[], zoneSlug?: string, region?: string): Promise<Quote> {
  const skus = [...new Set(items.map(item => item.sku))];
  const [rows, zoneRows, rates] = await Promise.all([
    skus.length
      ? db
          .select({
            sku: productVariants.sku,
            format: productVariants.format,
            priceCents: productVariants.priceCents,
            stock: productVariants.stock,
            bags: productVariants.bags,
            variantActive: productVariants.active,
            productName: products.name,
            grinds: products.grinds,
            productActive: products.active
          })
          .from(productVariants)
          .innerJoin(products, eq(products.id, productVariants.productId))
          .where(inArray(productVariants.sku, skus))
      : Promise.resolve([]),
    db
      .select({
        slug: shippingZones.slug,
        name: shippingZones.name,
        eta: shippingZones.eta,
        priceCents: shippingZones.priceCents,
        freeFromCents: shippingZones.freeFromCents,
        freeFromBags: shippingZones.freeFromBags,
        regions: shippingZones.regions
      })
      .from(shippingZones)
      .where(eq(shippingZones.active, true))
      .orderBy(asc(shippingZones.sortOrder)),
    db
      .select({ zone: shippingZones.slug, region: shippingRegionRates.region, priceCents: shippingRegionRates.priceCents })
      .from(shippingRegionRates)
      .innerJoin(shippingZones, eq(shippingZones.id, shippingRegionRates.zoneId))
  ]);
  const zones: Quote['zones'] = zoneRows.map(zone => ({ ...zone, hasRegionRates: rates.some(rate => rate.zone === zone.slug) }));

  const bySku = new Map(rows.map(row => [row.sku, row]));
  const requestedBySku = new Map<string, number>();
  for (const item of items) requestedBySku.set(item.sku, (requestedBySku.get(item.sku) ?? 0) + item.quantity);

  const lines: Quote['lines'] = [];
  let bags = 0;
  const issues: Quote['issues'] = [];
  const reportedStock = new Set<string>();

  for (const item of items) {
    const row = bySku.get(item.sku);
    if (!row || !row.variantActive || !row.productActive) {
      issues.push({ sku: item.sku, message: 'Este producto ya no está disponible.' });
      continue;
    }
    if (!row.grinds.includes(item.grind)) {
      issues.push({ sku: item.sku, message: `La molienda "${item.grind}" no está disponible para ${row.productName}.` });
      continue;
    }
    const requested = requestedBySku.get(item.sku)!;
    if (requested > row.stock) {
      if (!reportedStock.has(item.sku)) {
        reportedStock.add(item.sku);
        issues.push({
          sku: item.sku,
          message:
            row.stock === 0
              ? `${row.productName} ${row.format} está agotado por ahora.`
              : row.stock === 1
                ? `Solo queda 1 unidad de ${row.productName} ${row.format}.`
                : `Solo quedan ${row.stock} unidades de ${row.productName} ${row.format}.`
        });
      }
      continue;
    }
    bags += row.bags * item.quantity;
    lines.push({
      sku: item.sku,
      grind: item.grind,
      quantity: item.quantity,
      productName: row.productName,
      format: row.format,
      unitPriceCents: row.priceCents,
      lineTotalCents: row.priceCents * item.quantity
    });
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  let zone = zones.find(z => z.slug === zoneSlug);
  if (zone && region && zone.regions && !zone.regions.includes(region)) {
    issues.push({ sku: '', message: `${zone.name} no atiende ${region}. Elige otra zona de envío.` });
    zone = undefined;
  }
  // Tarifa del departamento si existe; si no, la base de la zona.
  const zonePrice = zone && (rates.find(rate => rate.zone === zone.slug && rate.region === region)?.priceCents ?? zone.priceCents);
  const shippingCents = zone ? (isFreeShipping(zone, subtotalCents, bags) ? 0 : zonePrice!) : null;

  return {
    lines,
    issues,
    zones,
    bags,
    subtotalCents,
    shippingCents,
    totalCents: shippingCents === null ? null : subtotalCents + shippingCents
  };
}

/** Crea un pedido pendiente de pago con precios y envío recalculados en el servidor. */
export async function createOrder(items: CartLine[], customer: Customer) {
  return getDb().transaction(async tx => {
    const quote = await quoteCart(tx, items, customer.zone, customer.region);
    if (quote.issues.length) throw new CartIssuesError(quote.issues);
    if (quote.shippingCents === null || quote.totalCents === null) {
      throw new CartIssuesError([{ sku: '', message: 'La zona de envío elegida no está disponible.' }]);
    }

    const [zone] = await tx
      .select({ id: shippingZones.id, name: shippingZones.name })
      .from(shippingZones)
      .where(and(eq(shippingZones.slug, customer.zone), eq(shippingZones.active, true)));
    const variantIds = new Map(
      (
        await tx
          .select({ id: productVariants.id, sku: productVariants.sku })
          .from(productVariants)
          .where(inArray(productVariants.sku, quote.lines.map(line => line.sku)))
      ).map(row => [row.sku, row.id])
    );

    const [order] = await tx
      .insert(orders)
      .values({
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        customerDocument: customer.document,
        shippingAddress: customer.address,
        shippingDistrict: customer.district,
        shippingCity: customer.city,
        shippingRegion: customer.region,
        shippingReference: customer.reference,
        shippingZoneId: zone.id,
        shippingZoneName: zone.name,
        notes: customer.notes,
        subtotalCents: quote.subtotalCents,
        shippingCents: quote.shippingCents,
        totalCents: quote.totalCents
      })
      .returning({ id: orders.id, number: orders.number });

    await tx.insert(orderItems).values(
      quote.lines.map(line => ({
        orderId: order.id,
        variantId: variantIds.get(line.sku)!,
        productName: line.productName,
        format: line.format,
        grind: line.grind,
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
        lineTotalCents: line.lineTotalCents
      }))
    );

    return order;
  });
}

type OrderLike = { items: { sku: string; grind: string; quantity: number }[]; shippingZoneId: number | null; shippingRegion: string };

/** Recotiza un pedido ya creado con el stock y precios vigentes (orders no guarda el slug de zona, solo el id). */
export async function quoteOrder(db: Executor, order: OrderLike): Promise<Quote> {
  let zoneSlug: string | undefined;
  if (order.shippingZoneId) {
    const [zone] = await db.select({ slug: shippingZones.slug }).from(shippingZones).where(eq(shippingZones.id, order.shippingZoneId));
    zoneSlug = zone?.slug;
  }
  const items: CartLine[] = order.items.map(item => ({ sku: item.sku, grind: item.grind, quantity: item.quantity }));
  return quoteCart(db, items, zoneSlug, order.shippingRegion);
}

/**
 * Reemplaza las líneas de un pedido pendiente (el cliente ajusta cantidades o quita un
 * producto cuando el stock se agotó antes de pagar). Nunca sobre un pedido que ya no admite cambios.
 */
export async function updateOrderItems(orderId: string, items: CartLine[]) {
  return getDb().transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new CartIssuesError([{ sku: '', message: 'Pedido no encontrado.' }]);
    if (order.status !== 'pending') throw new CartIssuesError([{ sku: '', message: 'Este pedido ya no se puede modificar.' }]);

    let zoneSlug: string | undefined;
    if (order.shippingZoneId) {
      const [zone] = await tx.select({ slug: shippingZones.slug }).from(shippingZones).where(eq(shippingZones.id, order.shippingZoneId));
      zoneSlug = zone?.slug;
    }
    const quote = await quoteCart(tx, items, zoneSlug, order.shippingRegion);
    if (quote.issues.length) throw new CartIssuesError(quote.issues);
    if (quote.shippingCents === null || quote.totalCents === null) {
      throw new CartIssuesError([{ sku: '', message: 'La zona de envío de este pedido ya no está disponible.' }]);
    }

    const variantIds = new Map(
      (
        await tx
          .select({ id: productVariants.id, sku: productVariants.sku })
          .from(productVariants)
          .where(inArray(productVariants.sku, quote.lines.map(line => line.sku)))
      ).map(row => [row.sku, row.id])
    );

    await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await tx.insert(orderItems).values(
      quote.lines.map(line => ({
        orderId,
        variantId: variantIds.get(line.sku)!,
        productName: line.productName,
        format: line.format,
        grind: line.grind,
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
        lineTotalCents: line.lineTotalCents
      }))
    );
    await tx
      .update(orders)
      .set({ subtotalCents: quote.subtotalCents, shippingCents: quote.shippingCents, totalCents: quote.totalCents })
      .where(eq(orders.id, orderId));

    return { items: quote.lines, subtotalCents: quote.subtotalCents, shippingCents: quote.shippingCents, totalCents: quote.totalCents };
  });
}

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
