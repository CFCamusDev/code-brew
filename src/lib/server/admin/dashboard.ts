import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { orders, products, productVariants } from '../db/schema';
import { SOLD_STATUSES } from './orders';

export const LOW_STOCK_THRESHOLD = 3;
const ABANDONED_AFTER_HOURS = 24;

// Fechas de negocio en hora de Lima, calculadas en la base de datos.
const limaToday = sql`(now() at time zone 'America/Lima')::date`;
const paidDayLima = sql`(${orders.paidAt} at time zone 'America/Lima')::date`;

export async function getDashboardSummary() {
  const db = getDb();

  const [[sales], [queues], lowStock] = await Promise.all([
    db
      .select({
        todayCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${paidDayLima} = ${limaToday}), 0)::int`,
        todayOrders: sql<number>`count(*) filter (where ${paidDayLima} = ${limaToday})::int`,
        monthCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${paidDayLima} >= date_trunc('month', ${limaToday})), 0)::int`,
        monthOrders: sql<number>`count(*) filter (where ${paidDayLima} >= date_trunc('month', ${limaToday}))::int`
      })
      .from(orders)
      .where(and(inArray(orders.status, [...SOLD_STATUSES]), sql`${orders.paidAt} is not null`)),
    db
      .select({
        toPrepare: sql<number>`count(*) filter (where ${orders.status} = 'paid')::int`,
        toShip: sql<number>`count(*) filter (where ${orders.status} = 'preparing')::int`,
        stockAlerts: sql<number>`count(*) filter (where ${orders.stockShortage} and ${orders.status} in ('paid', 'preparing'))::int`,
        abandoned: sql<number>`count(*) filter (where ${orders.status} = 'pending' and ${orders.createdAt} < now() - make_interval(hours => ${ABANDONED_AFTER_HOURS}))::int`
      })
      .from(orders),
    db
      .select({
        variantId: productVariants.id,
        productName: products.name,
        format: productVariants.format,
        stock: productVariants.stock
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(productVariants.active, true), eq(products.active, true), lte(productVariants.stock, LOW_STOCK_THRESHOLD)))
      .orderBy(asc(productVariants.stock), asc(products.sortOrder))
  ]);

  return {
    ...sales,
    monthAverageCents: sales.monthOrders ? Math.round(sales.monthCents / sales.monthOrders) : 0,
    ...queues,
    lowStock
  };
}
export type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>;
