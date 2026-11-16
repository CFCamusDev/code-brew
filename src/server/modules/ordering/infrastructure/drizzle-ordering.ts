import { and, eq, inArray } from 'drizzle-orm';
import { calculateShipping, shippingFor } from '../../shipping';
import type { Transaction } from '../../../shared/unit-of-work';
import type { getDb } from '../../../../lib/server/db';
import { orderItems, orders, products, productVariants, shippingZones } from '../../../../lib/server/db/schema';
import type { CatalogReader, OrderRepository, ShippingProvider } from '../application/ports/ports';

type Db = ReturnType<typeof getDb>;
/** Conexión (cotizar) o transacción (crear/modificar pedidos). */
export type Executor = Db | Transaction;

export function createDrizzleCatalogReader(db: Executor): CatalogReader {
  return {
    async findVariants(skus) {
      if (!skus.length) return [];
      return db
        .select({
          variantId: productVariants.id,
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
        .where(inArray(productVariants.sku, [...new Set(skus)]));
    }
  };
}

/** Adaptador del módulo shipping: expone sus zonas y su cálculo en los términos de pedidos. */
export function createShippingProvider(db: Executor): ShippingProvider {
  return {
    async load() {
      const { summaries, zones } = await shippingFor(db).listZones();
      return {
        zones: summaries,
        calculate: input => {
          const result = calculateShipping(zones, input);
          if (result.status === 'ok') return { status: 'ok', shippingCents: result.shippingCents };
          if (result.status === 'region_not_served') return { status: 'region_not_served', message: result.message };
          return { status: 'no_zone' };
        }
      };
    }
  };
}

export function createDrizzleOrderRepository(tx: Executor): OrderRepository {
  return {
    async findActiveZoneBySlug(slug) {
      const [zone] = await tx
        .select({ id: shippingZones.id, name: shippingZones.name })
        .from(shippingZones)
        .where(and(eq(shippingZones.slug, slug), eq(shippingZones.active, true)));
      return zone ?? null;
    },
    async findZoneSlugById(id) {
      const [zone] = await tx.select({ slug: shippingZones.slug }).from(shippingZones).where(eq(shippingZones.id, id));
      return zone?.slug ?? null;
    },
    async insertOrder({ customer, zone, subtotalCents, shippingCents, totalCents }) {
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
          subtotalCents,
          shippingCents,
          totalCents
        })
        .returning({ id: orders.id, number: orders.number });
      return order;
    },
    async lockOrder(orderId) {
      const [order] = await tx
        .select({ status: orders.status, shippingZoneId: orders.shippingZoneId, shippingRegion: orders.shippingRegion })
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update');
      return order ?? null;
    },
    async replaceItems(orderId, lines) {
      await tx.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await tx.insert(orderItems).values(
        lines.map(line => ({
          orderId,
          variantId: line.variantId,
          productName: line.productName,
          format: line.format,
          grind: line.grind,
          unitPriceCents: line.unitPriceCents,
          quantity: line.quantity,
          lineTotalCents: line.lineTotalCents
        }))
      );
    },
    async updateTotals(orderId, totals) {
      await tx.update(orders).set(totals).where(eq(orders.id, orderId));
    }
  };
}
