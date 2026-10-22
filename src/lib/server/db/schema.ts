import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';

// Todos los montos se guardan en céntimos de sol (PEN), igual que los espera Culqi.

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
};

/** Perfil de café (Origen Monteverde, Espresso Amazonas…). */
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  roast: text('roast').notNull(),
  /** Opciones de molienda que el cliente puede elegir. */
  grinds: jsonb('grinds').$type<string[]>().notNull().default([]),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps
});

/** Presentación vendible de un perfil (250 g, 500 g…), con su precio y stock. */
export const productVariants = pgTable(
  'product_variants',
  {
    id: serial('id').primaryKey(),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull().unique(),
    format: text('format').notNull(),
    priceCents: integer('price_cents').notNull(),
    stock: integer('stock').notNull().default(0),
    active: boolean('active').notNull().default(true),
    ...timestamps
  },
  t => [
    index('product_variants_product_idx').on(t.productId),
    check('product_variants_price_check', sql`${t.priceCents} >= 0`),
    check('product_variants_stock_check', sql`${t.stock} >= 0`)
  ]
);

export const orderStatus = pgEnum('order_status', [
  'pending', // creado, esperando pago
  'paid',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded'
]);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Número correlativo legible para el cliente y el panel (CB-000123). */
    number: serial('number').notNull().unique(),
    status: orderStatus('status').notNull().default('pending'),
    customerName: text('customer_name').notNull(),
    customerEmail: text('customer_email').notNull(),
    customerPhone: text('customer_phone').notNull(),
    customerDocument: text('customer_document'),
    shippingAddress: text('shipping_address').notNull(),
    shippingDistrict: text('shipping_district').notNull(),
    shippingCity: text('shipping_city').notNull(),
    shippingRegion: text('shipping_region').notNull(),
    shippingReference: text('shipping_reference'),
    notes: text('notes'),
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingCents: integer('shipping_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('PEN'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    ...timestamps
  },
  t => [
    index('orders_status_idx').on(t.status),
    index('orders_created_at_idx').on(t.createdAt),
    check('orders_totals_check', sql`${t.totalCents} = ${t.subtotalCents} + ${t.shippingCents}`)
  ]
);

/** Línea de un pedido. Nombre, formato y precio se copian para que el historial no cambie si luego se edita el catálogo. */
export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: integer('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),
    productName: text('product_name').notNull(),
    format: text('format').notNull(),
    grind: text('grind').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotalCents: integer('line_total_cents').notNull()
  },
  t => [
    index('order_items_order_idx').on(t.orderId),
    check('order_items_quantity_check', sql`${t.quantity} > 0`),
    check('order_items_total_check', sql`${t.lineTotalCents} = ${t.unitPriceCents} * ${t.quantity}`)
  ]
);

export const paymentStatus = pgEnum('payment_status', ['pending', 'paid', 'failed', 'refunded']);

/** Intento de pago ante Culqi. Un pedido puede tener varios (p. ej. una tarjeta rechazada y luego Yape). */
export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('culqi'),
    /** Id del cargo u orden en Culqi (chr_…, ord_…). */
    providerReference: text('provider_reference').unique(),
    method: text('method'),
    status: paymentStatus('status').notNull().default('pending'),
    amountCents: integer('amount_cents').notNull(),
    /** Respuesta de Culqi tal cual, para auditoría y conciliación. */
    raw: jsonb('raw'),
    ...timestamps
  },
  t => [index('payments_order_idx').on(t.orderId)]
);
