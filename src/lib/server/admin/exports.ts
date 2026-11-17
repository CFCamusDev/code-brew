import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { formatDateTime, formatOrderNumber } from '../../shop/format';
import { soles, toCsv } from '../csv';
import { getDb } from '../db';
import { adminUsers, orderItems, orders, payments, products, productVariants, purchases, stockMovements } from '../db/schema';
import { orderConditions, STATUS_LABEL, type OrderFilters } from './orders';
import { CATEGORY_LABEL } from './purchases';
import { reconcileGatewayPayments, type ReconciliationResult } from '../../../server/modules/payments';

const MAX_ROWS = 20_000;

const PAYMENT_METHOD: Record<string, string> = { card: 'Tarjeta', yape: 'Yape', order: 'Efectivo/billetera' };
const STOCK_REASON = { sale: 'Venta', refund: 'Devolución', adjustment: 'Ajuste', purchase: 'Ingreso' } as const;

export async function exportOrders(filters: OrderFilters) {
  const db = getDb();
  const rows = await db.select().from(orders).where(orderConditions(filters)).orderBy(desc(orders.createdAt)).limit(MAX_ROWS);
  const ids = rows.map(row => row.id);
  const [items, paid] = ids.length
    ? await Promise.all([
        db.select().from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(asc(orderItems.id)),
        db
          .select({ orderId: payments.orderId, method: payments.method })
          .from(payments)
          .where(and(inArray(payments.orderId, ids), inArray(payments.status, ['paid', 'refunded'])))
      ])
    : [[], []];

  return toCsv(
    [
      'Pedido', 'Fecha', 'Estado', 'Cliente', 'Correo', 'Celular', 'Documento', 'Departamento', 'Provincia', 'Distrito',
      'Dirección', 'Zona de envío', 'Productos', 'Bolsas', 'Subtotal (S/)', 'Envío (S/)', 'Total (S/)', 'Medio de pago', 'Pagado el'
    ],
    rows.map(order => {
      const lines = items.filter(item => item.orderId === order.id);
      const method = paid.find(payment => payment.orderId === order.id)?.method;
      return [
        formatOrderNumber(order.number),
        formatDateTime(order.createdAt),
        STATUS_LABEL[order.status],
        order.customerName,
        order.customerEmail,
        order.customerPhone,
        order.customerDocument,
        order.shippingRegion,
        order.shippingCity,
        order.shippingDistrict,
        order.shippingAddress,
        order.shippingZoneName,
        lines.map(line => `${line.quantity}× ${line.productName} ${line.format} (${line.grind})`).join('; '),
        lines.reduce((sum, line) => sum + line.quantity, 0),
        soles(order.subtotalCents),
        soles(order.shippingCents),
        soles(order.totalCents),
        method ? (PAYMENT_METHOD[method] ?? method) : '',
        order.paidAt ? formatDateTime(order.paidAt) : ''
      ];
    })
  );
}

const dateRange = (column: Parameters<typeof gte>[0], from?: string, to?: string) =>
  [from ? gte(column, from) : undefined, to ? lte(column, to) : undefined].filter(Boolean);

export async function exportPurchases(from?: string, to?: string) {
  const rows = await getDb()
    .select({
      purchasedOn: purchases.purchasedOn,
      category: purchases.category,
      supplier: purchases.supplier,
      description: purchases.description,
      documentNumber: purchases.documentNumber,
      amountCents: purchases.amountCents,
      notes: purchases.notes,
      adminName: adminUsers.name
    })
    .from(purchases)
    .leftJoin(adminUsers, eq(adminUsers.id, purchases.adminUserId))
    .where(and(...dateRange(purchases.purchasedOn, from, to)))
    .orderBy(asc(purchases.purchasedOn), asc(purchases.id))
    .limit(MAX_ROWS);

  return toCsv(
    ['Fecha', 'Categoría', 'Proveedor', 'Descripción', 'Comprobante', 'Monto (S/)', 'Notas', 'Registró'],
    rows.map(row => [
      row.purchasedOn,
      CATEGORY_LABEL[row.category],
      row.supplier,
      row.description,
      row.documentNumber,
      soles(row.amountCents),
      row.notes,
      row.adminName
    ])
  );
}

export async function exportStockMovements(from?: string, to?: string) {
  const day = sql`(${stockMovements.createdAt} at time zone 'America/Lima')::date`;
  const rows = await getDb()
    .select({
      createdAt: stockMovements.createdAt,
      productName: products.name,
      sku: productVariants.sku,
      format: productVariants.format,
      reason: stockMovements.reason,
      delta: stockMovements.delta,
      stockAfter: stockMovements.stockAfter,
      orderNumber: orders.number,
      note: stockMovements.note,
      adminName: adminUsers.name
    })
    .from(stockMovements)
    .innerJoin(productVariants, eq(productVariants.id, stockMovements.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .leftJoin(orders, eq(orders.id, stockMovements.orderId))
    .leftJoin(adminUsers, eq(adminUsers.id, stockMovements.adminUserId))
    .where(and(...(from ? [sql`${day} >= ${from}::date`] : []), ...(to ? [sql`${day} <= ${to}::date`] : [])))
    .orderBy(asc(stockMovements.createdAt), asc(stockMovements.id))
    .limit(MAX_ROWS);

  return toCsv(
    ['Fecha', 'Producto', 'SKU', 'Presentación', 'Motivo', 'Cambio', 'Stock resultante', 'Pedido', 'Nota', 'Usuario'],
    rows.map(row => [
      formatDateTime(row.createdAt),
      row.productName,
      row.sku,
      row.format,
      STOCK_REASON[row.reason],
      row.delta,
      row.stockAfter,
      row.orderNumber ? formatOrderNumber(row.orderNumber) : '',
      row.note,
      row.adminName
    ])
  );
}

const RECONCILIATION_RESULT: Record<ReconciliationResult, string> = {
  ok: 'Coincide',
  cobrado_sin_registrar: 'Cobrado en Culqi sin registrar en la tienda',
  registrado_sin_cobro: 'Registrado como pagado sin cobro en Culqi',
  monto_distinto: 'Monto distinto',
  devolucion_distinta: 'Devolución distinta'
};
const LOCAL_STATUS: Record<string, string> = { paid: 'Pagado', pending: 'Pendiente', failed: 'Fallido', refunded: 'Reembolsado' };
const GATEWAY_STATE: Record<string, string> = {
  paid: 'Cobrado',
  refunded: 'Devuelto',
  pending: 'Pendiente',
  expired: 'Vencido',
  deleted: 'Eliminado',
  other: 'Sin cobro'
};

/** Conciliación de pagos contra Culqi (S4.5): una fila por cargo u orden; las diferencias primero. */
export async function exportReconciliation(range: { from: Date; to: Date }) {
  const rows = await reconcileGatewayPayments(range);
  return toCsv(
    ['Resultado', 'Referencia', 'Tipo', 'Pedido', 'Fecha', 'Estado en la tienda', 'Monto tienda (S/)', 'Estado en Culqi', 'Monto Culqi (S/)', 'Id del pedido'],
    rows.map(row => [
      RECONCILIATION_RESULT[row.result],
      row.reference,
      row.kind === 'charge' ? 'Cargo (tarjeta/Yape)' : row.kind === 'order' ? 'Orden (PagoEfectivo/billetera)' : '',
      row.orderNumber === null ? '' : formatOrderNumber(row.orderNumber),
      formatDateTime(row.date),
      row.localStatus ? (LOCAL_STATUS[row.localStatus] ?? row.localStatus) : 'Sin registro',
      row.localAmountCents === null ? '' : soles(row.localAmountCents),
      row.gatewayState ? GATEWAY_STATE[row.gatewayState] : 'Sin registro',
      row.gatewayAmountCents === null ? '' : soles(row.gatewayAmountCents),
      row.orderId
    ])
  );
}
