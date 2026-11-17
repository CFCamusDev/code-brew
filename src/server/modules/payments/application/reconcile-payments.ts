import { reconcile, type LocalPayment, type ReconciliationRow } from '../domain/reconciliation';
import type { PaymentGateway } from './ports/payment-gateway';

/** Pagos que la tienda registró con referencia de la pasarela, creados en el rango. */
export interface LocalPaymentReader {
  listPayments(range: { from: Date; to: Date }): Promise<LocalPayment[]>;
}

/**
 * Caso de uso Conciliar (S4.5): lee los pagos de la tienda y los cargos y órdenes de la pasarela del mismo rango y los
 * compara. Las diferencias van primero. Lanza si la pasarela no responde: un reporte incompleto confundiría más que
 * ninguno.
 */
export async function reconcilePayments(
  deps: { reader: LocalPaymentReader; gateway: PaymentGateway },
  range: { from: Date; to: Date }
): Promise<ReconciliationRow[]> {
  const [local, remote] = await Promise.all([deps.reader.listPayments(range), deps.gateway.listTransactions(range)]);
  return reconcile(local, remote);
}
