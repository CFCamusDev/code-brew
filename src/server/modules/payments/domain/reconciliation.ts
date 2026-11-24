// Conciliación (S4.5): compara lo que la tienda registró como cobrado contra lo que la pasarela cobró de verdad.
// Regla pura: recibe los dos lados ya leídos y devuelve una fila por referencia (chr_… u ord_…).

/** Pago tal como lo registró la tienda (tabla payments). */
export interface LocalPayment {
  reference: string;
  orderId: string;
  orderNumber: number;
  /** paid | pending | failed | refunded */
  status: string;
  amountCents: number;
  createdAt: Date;
}

/** Cargo u orden tal como figura en la pasarela. */
export interface GatewayTransaction {
  reference: string;
  kind: 'charge' | 'order';
  amountCents: number;
  /** paid: cobrado · refunded: devuelto · pending: orden aún sin pagar · expired/deleted: orden que ya no se pagará · other: sin cobro */
  state: 'paid' | 'refunded' | 'pending' | 'expired' | 'deleted' | 'other';
  /** Pedido de la tienda que figura en la metadata de la pasarela, si lo trae. */
  orderId: string | null;
  createdAt: Date;
}

export type ReconciliationResult =
  /** Ambos lados coinciden. */
  | 'ok'
  /** La pasarela cobró y la tienda no lo registró como pagado: dinero recibido sin pedido confirmado. */
  | 'cobrado_sin_registrar'
  /** La tienda lo tiene como pagado y la pasarela no lo cobró (o no lo encuentra). */
  | 'registrado_sin_cobro'
  /** Ambos dicen cobrado, por montos distintos. */
  | 'monto_distinto'
  /** Uno lo tiene como devuelto y el otro no. */
  | 'devolucion_distinta';

export interface ReconciliationRow {
  reference: string;
  kind: 'charge' | 'order' | null;
  orderId: string | null;
  orderNumber: number | null;
  date: Date;
  localStatus: string | null;
  localAmountCents: number | null;
  gatewayState: GatewayTransaction['state'] | null;
  gatewayAmountCents: number | null;
  result: ReconciliationResult;
}

const moneyMoved = (state: string | null | undefined) => state === 'paid' || state === 'refunded';

function compare(local: LocalPayment | undefined, gateway: GatewayTransaction | undefined): ReconciliationResult {
  const localState = local?.status;
  const gatewayState = gateway?.state;
  if (gatewayState === 'paid' && localState !== 'paid' && localState !== 'refunded') return 'cobrado_sin_registrar';
  if (localState === 'paid' && gatewayState !== 'paid' && gatewayState !== 'refunded') return 'registrado_sin_cobro';
  if ((localState === 'refunded') !== (gatewayState === 'refunded') && moneyMoved(localState) && moneyMoved(gatewayState)) {
    return 'devolucion_distinta';
  }
  if (local && gateway && local.amountCents !== gateway.amountCents) return 'monto_distinto';
  return 'ok';
}

/**
 * Une ambos lados por referencia. Solo informa referencias donde algún lado registra dinero (pagado o devuelto):
 * una orden pendiente o vencida sin cobro en ningún lado no es una diferencia. Primero las diferencias, luego por fecha.
 */
export function reconcile(local: LocalPayment[], gateway: GatewayTransaction[]): ReconciliationRow[] {
  const localByReference = new Map(local.map(payment => [payment.reference, payment]));
  const gatewayByReference = new Map(gateway.map(transaction => [transaction.reference, transaction]));
  const references = new Set([...localByReference.keys(), ...gatewayByReference.keys()]);

  const rows: ReconciliationRow[] = [];
  for (const reference of references) {
    const own = localByReference.get(reference);
    const theirs = gatewayByReference.get(reference);
    if (!moneyMoved(own?.status) && !moneyMoved(theirs?.state)) continue;
    rows.push({
      reference,
      kind: theirs?.kind ?? (reference.startsWith('ord_') ? 'order' : reference.startsWith('chr_') ? 'charge' : null),
      orderId: own?.orderId ?? theirs?.orderId ?? null,
      orderNumber: own?.orderNumber ?? null,
      date: own?.createdAt ?? theirs!.createdAt,
      localStatus: own?.status ?? null,
      localAmountCents: own?.amountCents ?? null,
      gatewayState: theirs?.state ?? null,
      gatewayAmountCents: theirs?.amountCents ?? null,
      result: compare(own, theirs)
    });
  }
  return rows.sort((a, b) => Number(a.result === 'ok') - Number(b.result === 'ok') || a.date.getTime() - b.date.getTime());
}
