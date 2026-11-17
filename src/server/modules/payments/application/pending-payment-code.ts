import type { Clock } from '../../../shared/clock';
import type { PaymentGateway } from './ports/payment-gateway';

/** Lectura del pago por orden (PagoEfectivo, billeteras, agentes) que un pedido tiene pendiente. */
export interface PendingOrderPaymentReader {
  /** Referencia de la orden de la pasarela (ord_…) pendiente y no vencida del pedido, la más reciente; null si no hay. */
  findPendingOrderReference(orderId: string, now: Date): Promise<string | null>;
}

/** Código con el que el cliente completa un pago por orden. */
export interface PendingPaymentCode {
  code: string;
  amountCents: number;
  expiresAt: string;
}

/**
 * Caso de uso VerCodigoDePago: el CIP que el cliente debe pagar en agentes, banca o billetera. Se consulta a la
 * pasarela porque el código aparece recién cuando el cliente elige el medio en el checkout. Devuelve null si no hay
 * orden pendiente, si aún no tiene código, si ya venció o si la pasarela no responde: la página sigue ofreciendo pagar.
 */
export async function pendingPaymentCode(
  deps: { reader: PendingOrderPaymentReader; gateway: PaymentGateway; clock: Clock },
  orderId: string
): Promise<PendingPaymentCode | null> {
  if (!deps.gateway.isEnabled()) return null;
  const now = deps.clock.now();
  const reference = await deps.reader.findPendingOrderReference(orderId, now);
  if (!reference) return null;
  const fetched = await deps.gateway.fetchOrder(reference).catch(() => null);
  if (!fetched?.ok) return null;
  const { order } = fetched;
  const payable = order.state === 'pending' || order.state === 'created';
  if (!payable || !order.paymentCode || !order.expiresAt || order.expiresAt <= now) return null;
  return { code: order.paymentCode, amountCents: order.amountCents, expiresAt: order.expiresAt.toISOString() };
}
