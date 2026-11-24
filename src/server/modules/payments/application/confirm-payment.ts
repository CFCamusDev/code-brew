import { NotFoundError } from '../../../shared/errors';
import type { Clock } from '../../../shared/clock';
import type { ConfirmedPayment } from '../domain/payment-rules';
import type { ConfirmPaymentStore } from './ports/order-payment-store';

/**
 * - `confirmed`: el pedido pasó de pendiente a pagado y se descontó el stock.
 * - `already_processed`: la misma referencia ya estaba pagada (respuesta del cargo + webhook): sin efecto.
 * - `additional_payment`: pago nuevo sobre un pedido ya pagado o cerrado; hay que revisar una devolución.
 */
export type ConfirmPaymentOutcome = 'confirmed' | 'already_processed' | 'additional_payment';

/**
 * Caso de uso ConfirmarPago. Debe correr dentro de una transacción (UnitOfWork) y es idempotente:
 * bloquea el pedido, registra el pago con ON CONFLICT y solo la primera confirmación cambia el pedido y el stock.
 * Los correos se envían fuera de la transacción, a partir del resultado.
 */
export async function confirmPayment(
  deps: { store: ConfirmPaymentStore; clock: Clock },
  orderId: string,
  payment: ConfirmedPayment
): Promise<ConfirmPaymentOutcome> {
  const { store } = deps;
  const order = await store.lockOrder(orderId);
  if (!order) throw new NotFoundError(`Pedido ${orderId} no existe`);
  const previous = await store.findPaymentStatus(payment.reference);
  await store.upsertPaidPayment(orderId, payment);

  if (order.status !== 'pending') return previous === 'paid' ? 'already_processed' : 'additional_payment';

  const now = deps.clock.now();
  const { shortage } = await store.registerSale(orderId, await store.orderLines(orderId));
  await store.markOrderPaid(orderId, { paidAt: now, stockShortage: shortage });
  // La reserva aparta el mismo stock que se acaba de descontar: se libera para evitar el doble conteo (ADR 0005, S3.4).
  await store.releaseReservations(orderId, now);
  return 'confirmed';
}
