import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { orderItems, orders, payments as paymentsTable, products, productVariants } from '../db/schema';
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
        monthOrders: sql<number>`count(*) filter (where ${paidDayLima} >= date_trunc('month', ${limaToday}))::int`,
        // Mismo tramo del mes anterior (del 1 al mismo día), para comparar sin castigar meses a medias.
        prevMonthToDateCents: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${paidDayLima} >= date_trunc('month', ${limaToday} - interval '1 month') and ${paidDayLima} <= ${limaToday} - interval '1 month'), 0)::int`
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

export const PERFORMANCE_RANGES = [7, 30, 90] as const;
export type PerformanceRange = (typeof PERFORMANCE_RANGES)[number];

const PAYMENT_LABEL: Record<string, string> = { card: 'Tarjeta', yape: 'Yape', order: 'Efectivo o billetera' };

/** Ventas por día, cafés más vendidos y medios de pago de los últimos `days` días (hora de Lima). */
export async function getPerformance(days: PerformanceRange) {
  const db = getDb();
  const soldIn = sql`${orders.status} in ${[...SOLD_STATUSES]}`;
  const inRange = sql`${paidDayLima} > ${limaToday} - ${days}::int`;

  const [daily, [previous], top, payments] = await Promise.all([
    db.execute<{ day: string; cents: number; orders: number }>(sql`
      with days as (
        select generate_series(${limaToday} - ${days - 1}::int, ${limaToday}, interval '1 day')::date as day
      )
      select days.day::text as day,
             coalesce(sum(${orders.totalCents}), 0)::int as cents,
             count(${orders.id})::int as orders
      from days
      left join ${orders} on ${paidDayLima} = days.day and ${soldIn}
      group by days.day
      order by days.day`),
    db
      .select({ cents: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int` })
      .from(orders)
      .where(and(soldIn, sql`${paidDayLima} > ${limaToday} - ${2 * days}::int`, sql`${paidDayLima} <= ${limaToday} - ${days}::int`)),
    db.execute<{ name: string; units: number; cents: number }>(sql`
      select ${orderItems.productName} || ' · ' || ${orderItems.format} as name,
             sum(${orderItems.quantity})::int as units,
             sum(${orderItems.lineTotalCents})::int as cents
      from ${orderItems}
      join ${orders} on ${orders.id} = ${orderItems.orderId}
      where ${soldIn} and ${inRange}
      group by 1
      order by units desc, cents desc
      limit 5`),
    db.execute<{ method: string; orders: number; cents: number }>(sql`
      select coalesce(${paymentsTable.method}, 'card') as method,
             count(distinct ${orders.id})::int as orders,
             sum(${orders.totalCents})::int as cents
      from ${orders}
      join ${paymentsTable} on ${paymentsTable.orderId} = ${orders.id} and ${paymentsTable.status} = 'paid'
      where ${soldIn} and ${inRange}
      group by 1
      order by cents desc`)
  ]);

  const series = [...daily].map(row => ({ day: row.day, cents: Number(row.cents), orders: Number(row.orders) }));
  const totalCents = series.reduce((sum, row) => sum + row.cents, 0);
  return {
    days,
    series,
    totalCents,
    totalOrders: series.reduce((sum, row) => sum + row.orders, 0),
    previousCents: previous.cents,
    topProducts: [...top].map(row => ({ name: row.name, units: Number(row.units), cents: Number(row.cents) })),
    paymentMix: [...payments].map(row => ({ label: PAYMENT_LABEL[row.method] ?? row.method, orders: Number(row.orders), cents: Number(row.cents) }))
  };
}
export type Performance = Awaited<ReturnType<typeof getPerformance>>;
