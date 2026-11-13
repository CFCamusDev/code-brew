/** Estados de pedido que admiten reembolso: pagado y aún sin despachar. */
export const REFUNDABLE_STATUSES = ['paid', 'preparing'] as const;

export function isRefundableStatus(status: string): boolean {
  return (REFUNDABLE_STATUSES as readonly string[]).includes(status);
}

/** Los cargos de tarjeta y Yape (`chr_…`) se devuelven por la pasarela; las órdenes de pago (`ord_…`) no. */
export function isGatewayCharge(reference: string | null | undefined): reference is string {
  return !!reference && reference.startsWith('chr_');
}

/** Pago confirmado por la pasarela, con el monto y método que ella informó. */
export interface ConfirmedPayment {
  reference: string;
  method: string;
  amountCents: number;
  raw: unknown;
}

/** Línea de pedido que mueve stock. */
export interface SaleLine {
  variantId: number;
  quantity: number;
}
