import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import * as culqi from '../culqi';
import { getDb } from '../db';
import { adminUsers, orderEvents, orderItems, orders, payments, productVariants, stockMovements } from '../db/schema';
import { sendOrderShippedEmail } from '../email';
import { getOrder } from '../shop';

export type OrderStatus = (typeof orders.$inferSelect)['status'];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pendiente de pago',
  paid: 'Pagado',
  preparing: 'En preparación',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado'
};

/** Cambios de estado permitidos desde el panel. Pagar lo hace Culqi; reembolsar tiene su propia acción. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['cancelled'],
  paid: ['preparing', 'shipped'],
  preparing: ['shipped'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
  refunded: []
};

/** Estados que cuentan como venta: se cobró y no se devolvió. */
export const SOLD_STATUSES = ['paid', 'preparing', 'shipped', 'delivered'] as const satisfies readonly OrderStatus[];

/** Estados desde los que se puede reembolsar (antes de despachar). */
export const REFUNDABLE: OrderStatus[] = ['paid', 'preparing'];

const PAGE_SIZE = 25;

export interface OrderFilters {
  q?: string;
  status?: OrderStatus;
  /** Fechas YYYY-MM-DD en hora de Lima, inclusivas, sobre la fecha de creación del pedido. */
  from?: string;
  to?: string;
}

/** Filtros comunes de la lista y de la exportación. Sin `status` se usa para contar por estado. */
export function orderConditions({ q, status, from, to }: OrderFilters) {
  const filters: SQL[] = [];
  if (status) filters.push(eq(orders.status, status));
  if (from) filters.push(sql`(${orders.createdAt} at time zone 'America/Lima')::date >= ${from}::date`);
  if (to) filters.push(sql`(${orders.createdAt} at time zone 'America/Lima')::date <= ${to}::date`);
  if (q) {
    const number = Number(q.replace(/^CB-?/i, ''));
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    filters.push(
      or(
        ilike(orders.customerName, like),
        ilike(orders.customerEmail, like),
        ilike(orders.customerPhone, like),
        ...(Number.isInteger(number) && number > 0 ? [eq(orders.number, number)] : [])
      )!
    );
  }
  return filters.length ? and(...filters) : undefined;
}

export async function listOrders({ page, ...filters }: OrderFilters & { page: number }) {
  const db = getDb();
  const where = orderConditions(filters);

  const [rows, [{ total }], byStatus] = await Promise.all([
    db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        shippingZoneName: orders.shippingZoneName,
        shippingRegion: orders.shippingRegion,
        totalCents: orders.totalCents,
        stockShortage: orders.stockShortage,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(orders).where(where),
    // Conteo por estado dentro del mismo rango de fechas y búsqueda.
    db.select({ status: orders.status, total: count() }).from(orders).where(orderConditions({ ...filters, status: undefined })).groupBy(orders.status)
  ]);

  return {
    rows,
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    byStatus: Object.fromEntries(byStatus.map(row => [row.status, row.total])) as Partial<Record<OrderStatus, number>>
  };
}

export async function getOrderDetail(id: string) {
  const order = await getOrder(id);
  if (!order) return undefined;
  const db = getDb();
  const [paymentRows, events] = await Promise.all([
    db
      .select({
        id: payments.id,
        reference: payments.providerReference,
        method: payments.method,
        status: payments.status,
        amountCents: payments.amountCents,
        createdAt: payments.createdAt
      })
      .from(payments)
      .where(eq(payments.orderId, id))
      .orderBy(asc(payments.createdAt)),
    db
      .select({
        id: orderEvents.id,
        type: orderEvents.type,
        fromStatus: orderEvents.fromStatus,
        toStatus: orderEvents.toStatus,
        note: orderEvents.note,
        createdAt: orderEvents.createdAt,
        adminName: adminUsers.name
      })
      .from(orderEvents)
      .leftJoin(adminUsers, eq(adminUsers.id, orderEvents.adminUserId))
      .where(eq(orderEvents.orderId, id))
      .orderBy(asc(orderEvents.createdAt))
  ]);
  const chargePaid = paymentRows.find(p => p.status === 'paid' && p.reference?.startsWith('chr_'));
  return { ...order, payments: paymentRows, events, refundableCharge: chargePaid ?? null };
}

export class AdminActionError extends Error {}

/** Acción no permitida para el rol del usuario (403). */
export class ForbiddenError extends AdminActionError {}

export async function changeStatus(
  orderId: string,
  to: OrderStatus,
  adminUserId: number,
  extra: { carrier?: string; trackingNumber?: string; note?: string } = {}
) {
  const db = getDb();
  await db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new AdminActionError('Pedido no encontrado.');
    if (!TRANSITIONS[order.status].includes(to)) {
      throw new AdminActionError(`No se puede pasar de "${STATUS_LABEL[order.status]}" a "${STATUS_LABEL[to]}".`);
    }
    const now = new Date();
    await tx
      .update(orders)
      .set({
        status: to,
        ...(to === 'shipped' ? { shippedAt: now, carrier: extra.carrier || null, trackingNumber: extra.trackingNumber || null } : {}),
        ...(to === 'delivered' ? { deliveredAt: now } : {}),
        ...(to === 'cancelled' ? { cancelledAt: now } : {})
      })
      .where(eq(orders.id, orderId));
    await tx.insert(orderEvents).values({
      orderId,
      type: 'status',
      fromStatus: order.status,
      toStatus: to,
      note: extra.note || null,
      adminUserId
    });
  });

  if (to === 'shipped') {
    const order = await getOrder(orderId);
    if (order) await sendOrderShippedEmail(order);
  }
}

/** Repone el stock de las líneas del pedido (devolución). */
async function restock(tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0], orderId: string, adminUserId: number) {
  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  for (const item of items) {
    const [variant] = await tx
      .update(productVariants)
      .set({ stock: sql`${productVariants.stock} + ${item.quantity}` })
      .where(eq(productVariants.id, item.variantId))
      .returning({ stock: productVariants.stock });
    await tx.insert(stockMovements).values({
      variantId: item.variantId,
      delta: item.quantity,
      stockAfter: variant.stock,
      reason: 'refund',
      orderId,
      adminUserId
    });
  }
}

/**
 * Reembolsa el pedido completo. Con un cargo de tarjeta o Yape la devolución se hace en Culqi;
 * los pagos por orden (PagoEfectivo, billeteras) se devuelven desde CulqiPanel y aquí solo se registran (`manual`).
 */
export async function refundOrder(
  orderId: string,
  adminUserId: number,
  { reason, restockItems, manual, note }: { reason: culqi.RefundReason; restockItems: boolean; manual: boolean; note?: string }
) {
  const detail = await getOrderDetail(orderId);
  if (!detail) throw new AdminActionError('Pedido no encontrado.');
  if (!REFUNDABLE.includes(detail.status)) throw new AdminActionError('Solo se reembolsan pedidos pagados que aún no se despachan.');

  let refundId: string | null = null;
  if (!manual) {
    const charge = detail.refundableCharge;
    if (!charge?.reference) {
      throw new AdminActionError('Este pago no se puede devolver automáticamente. Hazlo desde CulqiPanel y regístralo como reembolso manual.');
    }
    const response = await culqi.createRefund(charge.reference, charge.amountCents, reason);
    if (response.status !== 201 || culqi.isCulqiError(response.data)) {
      console.error('[culqi] reembolso fallido', response.status, response.data);
      const message = culqi.isCulqiError(response.data) ? response.data.merchant_message : undefined;
      throw new AdminActionError(`Culqi rechazó el reembolso${message ? `: ${message}` : '.'}`);
    }
    refundId = response.data.id;
  }

  await getDb().transaction(async tx => {
    const [order] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).for('update');
    await tx.update(orders).set({ status: 'refunded' }).where(eq(orders.id, orderId));
    await tx
      .update(payments)
      .set({ status: 'refunded' })
      .where(and(eq(payments.orderId, orderId), eq(payments.status, 'paid')));
    if (restockItems) await restock(tx, orderId, adminUserId);
    await tx.insert(orderEvents).values({
      orderId,
      type: 'refund',
      fromStatus: order.status,
      toStatus: 'refunded',
      note: [manual ? 'Reembolso manual (CulqiPanel)' : `Reembolso Culqi ${refundId}`, note].filter(Boolean).join(' · '),
      adminUserId
    });
  });
}

export async function saveAdminNotes(orderId: string, adminNotes: string) {
  await getDb().update(orders).set({ adminNotes: adminNotes || null }).where(eq(orders.id, orderId));
}

export const MAX_DISPATCH_SHEETS = 50;

/** Datos de entrega y productos para imprimir hojas de despacho, en el orden pedido. Sin montos ni pagos. */
export async function getDispatchSheets(ids: string[]) {
  if (!ids.length) return [];
  const db = getDb();
  const [orderRows, itemRows] = await Promise.all([
    db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        shippingAddress: orders.shippingAddress,
        shippingDistrict: orders.shippingDistrict,
        shippingCity: orders.shippingCity,
        shippingRegion: orders.shippingRegion,
        shippingReference: orders.shippingReference,
        shippingZoneName: orders.shippingZoneName,
        notes: orders.notes,
        carrier: orders.carrier,
        trackingNumber: orders.trackingNumber,
        stockShortage: orders.stockShortage,
        paidAt: orders.paidAt
      })
      .from(orders)
      .where(inArray(orders.id, ids)),
    db
      .select({ orderId: orderItems.orderId, productName: orderItems.productName, format: orderItems.format, grind: orderItems.grind, quantity: orderItems.quantity })
      .from(orderItems)
      .where(inArray(orderItems.orderId, ids))
      .orderBy(asc(orderItems.id))
  ]);
  const byId = new Map(orderRows.map(order => [order.id, { ...order, items: itemRows.filter(item => item.orderId === order.id) }]));
  return ids.map(id => byId.get(id)).filter(order => order !== undefined);
}
