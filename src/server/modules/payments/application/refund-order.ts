import { ConflictError, NotFoundError } from '../../../shared/errors';
import { isRefundableStatus } from '../domain/payment-rules';
import type { RefundReason } from '../domain/refund-reason';
import type { PaymentGateway } from './ports/payment-gateway';
import type { RefundReader, RefundStore } from './ports/order-payment-store';

export interface RefundOptions {
  reason: RefundReason;
  restockItems: boolean;
  /** El dinero ya se devolvió fuera del sistema (CulqiPanel): solo se registra. */
  manual: boolean;
  note?: string;
}

export interface RefundDeps {
  gateway: PaymentGateway;
  reader: RefundReader;
  /** Abre la transacción del reembolso (UnitOfWork). */
  transact(work: (store: RefundStore) => Promise<void>): Promise<void>;
}

/**
 * Caso de uso Reembolsar: reembolsa el pedido completo. Con un cargo de tarjeta o Yape la devolución se hace en la
 * pasarela (fuera de la transacción); los pagos por orden (PagoEfectivo, billeteras) se devuelven aparte y aquí solo
 * se registran (`manual`). Después, en una sola transacción: pedido y pagos a reembolsado, reposición de stock y evento.
 */
export async function refundOrder(deps: RefundDeps, orderId: string, adminUserId: number, options: RefundOptions): Promise<void> {
  const order = await deps.reader.findOrder(orderId);
  if (!order) throw new NotFoundError('Pedido no encontrado.');
  if (!isRefundableStatus(order.status)) throw new ConflictError('Solo se reembolsan pedidos pagados que aún no se despachan.');

  let refundId: string | null = null;
  if (!options.manual) {
    const charge = order.refundableCharge;
    if (!charge) {
      throw new ConflictError('Este pago no se puede devolver automáticamente. Hazlo desde CulqiPanel y regístralo como reembolso manual.');
    }
    const result = await deps.gateway.refund({ chargeId: charge.reference, amountCents: charge.amountCents, reason: options.reason });
    if (!result.ok) {
      console.error('[culqi] reembolso fallido', result.status, result.raw);
      throw new ConflictError(`Culqi rechazó el reembolso${result.message ? `: ${result.message}` : '.'}`);
    }
    refundId = result.refundId;
  }

  await deps.transact(async store => {
    const status = await store.lockOrderStatus(orderId);
    if (status === null) throw new NotFoundError('Pedido no encontrado.');
    await store.markOrderRefunded(orderId);
    await store.markPaymentsRefunded(orderId);
    if (options.restockItems) await store.restock(orderId, adminUserId);
    await store.recordRefundEvent({
      orderId,
      fromStatus: status,
      adminUserId,
      note: [options.manual ? 'Reembolso manual (CulqiPanel)' : `Reembolso Culqi ${refundId}`, options.note].filter(Boolean).join(' · ')
    });
  });
}
