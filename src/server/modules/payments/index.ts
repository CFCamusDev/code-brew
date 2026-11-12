import { CULQI_PUBLIC_KEY, CULQI_SECRET_KEY } from 'astro:env/server';
import type { PaymentGateway } from './application/ports/payment-gateway';
import { CulqiGateway } from './infrastructure/culqi-gateway';

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
export { REFUND_REASONS, type RefundReason } from './domain/refund-reason';
export { FakeGateway } from './infrastructure/fake-gateway';

let gateway: PaymentGateway | undefined;

/** Pasarela de la aplicación (Culqi). Se crea al primer uso. */
export function getPaymentGateway(): PaymentGateway {
  gateway ??= new CulqiGateway({ publicKey: CULQI_PUBLIC_KEY, secretKey: CULQI_SECRET_KEY });
  return gateway;
}
