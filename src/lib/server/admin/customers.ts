import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { orderItems, orders } from '../db/schema';
import { SOLD_STATUSES } from './orders';

// Compra como invitado: el cliente se identifica por su correo y todo se calcula desde los pedidos.

const PAGE_SIZE = 25;
const sold = sql`${orders.status} in ${[...SOLD_STATUSES]}`;

export type CustomerSort = 'total' | 'reciente';

export async function listCustomers({ q, sort, page }: { q?: string; sort: CustomerSort; page: number }) {
  const db = getDb();
  const like = q ? `%${q.replace(/[%_\\]/g, '\\$&')}%` : undefined;
  const where = like ? or(ilike(orders.customerName, like), ilike(orders.customerEmail, like), ilike(orders.customerPhone, like)) : undefined;

  const email = sql<string>`lower(${orders.customerEmail})`;
  const totalCents = sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${sold}), 0)::int`;
  const lastPurchase = sql<Date | null>`max(${orders.paidAt}) filter (where ${sold})`;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        email,
        // El nombre y celular más recientes que usó.
        name: sql<string>`(array_agg(${orders.customerName} order by ${orders.createdAt} desc))[1]`,
        phone: sql<string>`(array_agg(${orders.customerPhone} order by ${orders.createdAt} desc))[1]`,
        paidOrders: sql<number>`count(*) filter (where ${sold})::int`,
        totalCents,
        lastPurchase
      })
      .from(orders)
      .where(where)
      .groupBy(email)
      .orderBy(sort === 'total' ? desc(totalCents) : sql`${lastPurchase} desc nulls last`, desc(sql`max(${orders.createdAt})`))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(distinct lower(${orders.customerEmail}))::int` }).from(orders).where(where)
  ]);

  return { rows, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getCustomer(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const db = getDb();
  const orderRows = await db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      customerDocument: orders.customerDocument,
      shippingDistrict: orders.shippingDistrict,
      shippingRegion: orders.shippingRegion,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt
    })
    .from(orders)
    .where(eq(sql`lower(${orders.customerEmail})`, email))
    .orderBy(desc(orders.createdAt));
  if (!orderRows.length) return undefined;

  const soldOrders = orderRows.filter(order => (SOLD_STATUSES as readonly string[]).includes(order.status));
  const favorites = soldOrders.length
    ? await db
        .select({
          productName: orderItems.productName,
          format: orderItems.format,
          quantity: sql<number>`sum(${orderItems.quantity})::int`
        })
        .from(orderItems)
        .where(and(inArray(orderItems.orderId, soldOrders.map(order => order.id))))
        .groupBy(orderItems.productName, orderItems.format)
        .orderBy(desc(sql`sum(${orderItems.quantity})`))
        .limit(3)
    : [];

  const totalCents = soldOrders.reduce((sum, order) => sum + order.totalCents, 0);
  const paidDates = soldOrders.map(order => order.paidAt).filter((date): date is Date => date !== null);
  const latest = orderRows[0];
  return {
    email,
    name: latest.customerName,
    phone: latest.customerPhone,
    document: orderRows.find(order => order.customerDocument)?.customerDocument ?? null,
    district: `${latest.shippingDistrict}, ${latest.shippingRegion}`,
    paidOrders: soldOrders.length,
    totalCents,
    averageCents: soldOrders.length ? Math.round(totalCents / soldOrders.length) : 0,
    firstPurchase: paidDates.length ? new Date(Math.min(...paidDates.map(Number))) : null,
    lastPurchase: paidDates.length ? new Date(Math.max(...paidDates.map(Number))) : null,
    favorites,
    orders: orderRows
  };
}
