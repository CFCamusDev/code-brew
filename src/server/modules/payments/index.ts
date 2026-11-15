import { CULQI_PUBLIC_KEY, CULQI_SECRET_KEY } from 'astro:env/server';
import type { PaymentGateway } from './application/ports/payment-gateway';
import { systemClock } from '../../shared/clock';
import { unitOfWork } from '../../shared/unit-of-work';
import { getDb } from '../../../lib/server/db';
import { logger } from '../../../lib/server/logger';
import { confirmPayment, type ConfirmPaymentOutcome } from './application/confirm-payment';
import { refundOrder, type RefundOptions } from './application/refund-order';
import type { ConfirmedPayment } from './domain/payment-rules';
import { CulqiGateway } from './infrastructure/culqi-gateway';
import { createConfirmPaymentStore, createRefundReader, createRefundStore } from './infrastructure/drizzle-order-payment-store';

// API pública del módulo payments. Raíz de composición: aquí se elige el adaptador de la pasarela.

export type {
  ChargeOutcome,
  ChargeRequest,
  CreateOrderOutcome,
  FetchOrderOutcome,
  GatewayFailure,
  PaymentGateway,
  PaymentOrder,
  PaymentOrderRequest,
  PaymentOrderState,
  RefundOutcome,
  RefundRequest
} from './application/ports/payment-gateway';
export { isValidWebhookKey } from './http/webhook-key';
export { REFUND_REASONS, type RefundReason } from './domain/refund-reason';
export { REFUNDABLE_STATUSES, isRefundableStatus, type ConfirmedPayment } from './domain/payment-rules';
export type { ConfirmPaymentOutcome } from './application/confirm-payment';
export type { RefundOptions } from './application/refund-order';
export { FakeGateway } from './infrastructure/fake-gateway';

let gateway: PaymentGateway | undefined;

/** Pasarela de la aplicación (Culqi). Se crea al primer uso. */
export function getPaymentGateway(): PaymentGateway {
  gateway ??= new CulqiGateway({ publicKey: CULQI_PUBLIC_KEY, secretKey: CULQI_SECRET_KEY });
  return gateway;
}

/**
 * ConfirmarPago en su propia transacción. Idempotente. Quien llama envía los correos después, fuera de la transacción,
 * solo cuando el resultado es `confirmed`.
 */
export function confirmOrderPayment(orderId: string, payment: ConfirmedPayment): Promise<ConfirmPaymentOutcome> {
  return unitOfWork.run(tx => confirmPayment({ store: createConfirmPaymentStore(tx), clock: systemClock }, orderId, payment));
}

/** Reembolsar el pedido completo (ver caso de uso). */
export function refundPaidOrder(orderId: string, adminUserId: number, options: RefundOptions): Promise<void> {
  return refundOrder(
    {
      gateway: getPaymentGateway(),
      reader: createRefundReader(getDb()),
      transact: work => unitOfWork.run(tx => work(createRefundStore(tx))),
      logError: (message, context) => logger.error(message, new Error(message), context)
    },
    orderId,
    adminUserId,
    options
  );
}
