import { and, asc, eq } from 'drizzle-orm';
import { inventoryFor } from '../../inventory';
import type { Transaction } from '../../../shared/unit-of-work';
import type { getDb } from '../../../../lib/server/db';
import { orderEvents, orderItems, orders, payments } from '../../../../lib/server/db/schema';
import type { ConfirmPaymentStore, RefundReader, RefundStore } from '../application/ports/order-payment-store';
import { isGatewayCharge } from '../domain/payment-rules';

type Db = ReturnType<typeof getDb>;

/** Operaciones de ConfirmarPago sobre la transacción del llamador. */
export function createConfirmPaymentStore(tx: Transaction): ConfirmPaymentStore {
  return {
    async lockOrder(orderId) {
      const [order] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).for('update');
      return order ?? null;
    },
    async findPaymentStatus(reference) {
      const [previous] = await tx.select({ status: payments.status }).from(payments).where(eq(payments.providerReference, reference));
      return previous?.status ?? null;
    },
    async upsertPaidPayment(orderId, payment) {
      await tx
        .insert(payments)
        .values({
          orderId,
          providerReference: payment.reference,
          method: payment.method,
          status: 'paid',
          amountCents: payment.amountCents,
          raw: payment.raw
        })
        .onConflictDoUpdate({ target: payments.providerReference, set: { status: 'paid', raw: payment.raw } });
    },
    orderLines(orderId) {
      return tx.select({ variantId: orderItems.variantId, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, orderId));
    },
    registerSale: (orderId, lines) => inventoryFor(tx).registerSale(orderId, lines),
    async markOrderPaid(orderId, { paidAt, stockShortage }) {
      await tx.update(orders).set({ status: 'paid', paidAt, stockShortage }).where(eq(orders.id, orderId));
    }
  };
}

/** Lecturas previas al reembolso, sobre la conexión (fuera de la transacción). */
export function createRefundReader(db: Db): RefundReader {
  return {
    async findOrder(orderId) {
      const [order] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
      if (!order) return null;
      const rows = await db
        .select({ reference: payments.providerReference, status: payments.status, amountCents: payments.amountCents })
        .from(payments)
        .where(eq(payments.orderId, orderId))
        .orderBy(asc(payments.createdAt));
      const charge = rows.find(row => row.status === 'paid' && isGatewayCharge(row.reference));
      return {
        status: order.status,
        refundableCharge: charge ? { reference: charge.reference!, amountCents: charge.amountCents } : null
      };
    }
  };
}

/** Operaciones de Reembolsar sobre la transacción del llamador. */
export function createRefundStore(tx: Transaction): RefundStore {
  return {
    async lockOrderStatus(orderId) {
      const [order] = await tx.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId)).for('update');
      return order?.status ?? null;
    },
    async markOrderRefunded(orderId) {
      await tx.update(orders).set({ status: 'refunded' }).where(eq(orders.id, orderId));
    },
    async markPaymentsRefunded(orderId) {
      await tx
        .update(payments)
        .set({ status: 'refunded' })
        .where(and(eq(payments.orderId, orderId), eq(payments.status, 'paid')));
    },
    async restock(orderId, adminUserId) {
      const lines = await tx
        .select({ variantId: orderItems.variantId, quantity: orderItems.quantity })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      await inventoryFor(tx).restockOrder(orderId, adminUserId, lines);
    },
    async recordRefundEvent({ orderId, fromStatus, adminUserId, note }) {
      await tx.insert(orderEvents).values({
        orderId,
        type: 'refund',
        fromStatus: fromStatus as (typeof orders.$inferSelect)['status'],
        toStatus: 'refunded',
        note,
        adminUserId
      });
    }
  };
}
