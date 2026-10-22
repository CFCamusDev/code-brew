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
  uniqueIndex,
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
    /** Bolsas que contiene la presentación (el Pack Developer trae 2). Cuenta para el envío gratis. */
    bags: integer('bags').notNull().default(1),
    active: boolean('active').notNull().default(true),
    ...timestamps
  },
  t => [
    index('product_variants_product_idx').on(t.productId),
    check('product_variants_bags_check', sql`${t.bags} > 0`),
    check('product_variants_price_check', sql`${t.priceCents} >= 0`),
    check('product_variants_stock_check', sql`${t.stock} >= 0`)
  ]
);

/** Zona de envío con su tarifa. Envío gratis desde `freeFromCents` de subtotal o desde `freeFromBags` bolsas. */
export const shippingZones = pgTable(
  'shipping_zones',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    /** Plazo mostrado al cliente, p. ej. "1 a 2 días hábiles". */
    eta: text('eta').notNull(),
    priceCents: integer('price_cents').notNull(),
    freeFromCents: integer('free_from_cents'),
    freeFromBags: integer('free_from_bags'),
    /** Departamentos que atiende la zona; null = todos. */
    regions: jsonb('regions').$type<string[]>(),
    active: boolean('active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps
  },
  t => [check('shipping_zones_price_check', sql`${t.priceCents} >= 0`)]
);

/** Tarifa de una zona para un departamento concreto; reemplaza la tarifa base de la zona. */
export const shippingRegionRates = pgTable(
  'shipping_region_rates',
  {
    id: serial('id').primaryKey(),
    zoneId: integer('zone_id')
      .notNull()
      .references(() => shippingZones.id, { onDelete: 'cascade' }),
    region: text('region').notNull(),
    priceCents: integer('price_cents').notNull(),
    ...timestamps
  },
  t => [
    uniqueIndex('shipping_region_rates_zone_region_idx').on(t.zoneId, t.region),
    check('shipping_region_rates_price_check', sql`${t.priceCents} >= 0`)
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
    shippingZoneId: integer('shipping_zone_id').references(() => shippingZones.id, { onDelete: 'restrict' }),
    /** Nombre de la zona al momento de la compra. */
    shippingZoneName: text('shipping_zone_name'),
    notes: text('notes'),
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingCents: integer('shipping_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('PEN'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /** Se pagó pero no alcanzó el stock al confirmar: requiere revisión manual. */
    stockShortage: boolean('stock_shortage').notNull().default(false),
    carrier: text('carrier'),
    trackingNumber: text('tracking_number'),
    /** Notas internas del equipo; el cliente no las ve. */
    adminNotes: text('admin_notes'),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
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
    /** Vencimiento de una orden de Culqi (PagoEfectivo, billeteras, agentes). */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Respuesta de Culqi tal cual, para auditoría y conciliación. */
    raw: jsonb('raw'),
    ...timestamps
  },
  t => [index('payments_order_idx').on(t.orderId)]
);

export const adminRole = pgEnum('admin_role', ['admin', 'operator']);

/** Usuarios del panel. `admin` gestiona todo; `operator` atiende pedidos, stock y compras. */
export const adminUsers = pgTable('admin_users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: adminRole('role').notNull().default('operator'),
  active: boolean('active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  ...timestamps
});

/** Sesión del panel. El id es el SHA-256 del token de la cookie: un volcado de la tabla no permite iniciar sesión. */
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [index('admin_sessions_user_idx').on(t.userId)]
);

/** Historial del pedido: cambios de estado, notas y devoluciones, con quién los hizo. */
export const orderEvents = pgTable(
  'order_events',
  {
    id: serial('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    fromStatus: orderStatus('from_status'),
    toStatus: orderStatus('to_status'),
    note: text('note'),
    adminUserId: integer('admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [index('order_events_order_idx').on(t.orderId)]
);

export const stockReason = pgEnum('stock_reason', ['sale', 'refund', 'adjustment', 'purchase']);

/** Cada cambio de stock con su motivo: ventas, devoluciones, ajustes manuales e ingresos por compra. */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: serial('id').primaryKey(),
    variantId: integer('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    delta: integer('delta').notNull(),
    stockAfter: integer('stock_after').notNull(),
    reason: stockReason('reason').notNull(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    adminUserId: integer('admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  t => [index('stock_movements_variant_idx').on(t.variantId), index('stock_movements_created_idx').on(t.createdAt)]
);
