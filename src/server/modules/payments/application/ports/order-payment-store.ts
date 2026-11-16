import type { ConfirmedPayment, SaleLine } from '../../domain/payment-rules';
import type { RefundReason } from '../../domain/refund-reason';

/** Operaciones de ConfirmarPago. Todas corren dentro de la misma transacción. */
export interface ConfirmPaymentStore {
  /** Bloquea el pedido (FOR UPDATE) y devuelve su estado; null si no existe. */
  lockOrder(orderId: string): Promise<{ status: string } | null>;
  findPaymentStatus(reference: string): Promise<string | null>;
  /** Inserta el pago como pagado o, si la referencia ya existe, lo actualiza (ON CONFLICT). */
  upsertPaidPayment(orderId: string, payment: ConfirmedPayment): Promise<void>;
  orderLines(orderId: string): Promise<SaleLine[]>;
  /** Descuenta el stock vendido (módulo inventory); una línea sin stock no se descuenta y se informa. */
  registerSale(orderId: string, lines: SaleLine[]): Promise<{ shortage: boolean }>;
  markOrderPaid(orderId: string, data: { paidAt: Date; stockShortage: boolean }): Promise<void>;
}

/** Lecturas previas al reembolso (fuera de la transacción). */
export interface RefundReader {
  findOrder(orderId: string): Promise<{
    status: string;
    /** Pago pagado con cargo de pasarela, el que se puede devolver automáticamente. */
    refundableCharge: { reference: string; amountCents: number } | null;
  } | null>;
}

/** Operaciones de Reembolsar. Todas corren dentro de la misma transacción. */
export interface RefundStore {
  lockOrderStatus(orderId: string): Promise<string | null>;
  markOrderRefunded(orderId: string): Promise<void>;
  markPaymentsRefunded(orderId: string): Promise<void>;
  /** Repone el stock de las líneas del pedido (módulo inventory). */
  restock(orderId: string, adminUserId: number): Promise<void>;
  recordRefundEvent(event: { orderId: string; fromStatus: string; adminUserId: number; note: string }): Promise<void>;
}

export type { RefundReason };
