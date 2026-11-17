import type {
  ChargeOutcome,
  ChargeRequest,
  CreateOrderOutcome,
  FetchOrderOutcome,
  PaymentGateway,
  PaymentOrder,
  PaymentOrderRequest,
  PaymentOrderState,
  RefundOutcome,
  RefundRequest
} from '../application/ports/payment-gateway';

/**
 * Pasarela determinista para pruebas: el resultado de un cargo depende del token, sin red ni azar.
 * Cada llamada se registra para poder afirmar sobre ella.
 */
export class FakeGateway implements PaymentGateway {
  /** Tokens que escogen el resultado del cargo. */
  static readonly TOKENS = {
    OK: 'tkn_fake_ok',
    DECLINED: 'tkn_fake_declined',
    REQUIRES_3DS: 'tkn_fake_3ds',
    ERROR: 'tkn_fake_error',
    UNEXPECTED: 'tkn_fake_unexpected'
  } as const;

  readonly charges: ChargeRequest[] = [];
  readonly orders: PaymentOrderRequest[] = [];
  readonly refunds: RefundRequest[] = [];

  private chargeSeq = 0;
  private orderSeq = 0;
  private refundSeq = 0;
  private readonly orderStates = new Map<string, { request: PaymentOrderRequest; state: PaymentOrderState }>();
  private readonly refunded = new Set<string>();

  constructor(private readonly options: { enabled?: boolean; publicKey?: string } = {}) {}

  isEnabled() {
    return this.options.enabled ?? true;
  }

  publicKey() {
    return this.options.publicKey ?? 'pk_fake';
  }

  async charge(request: ChargeRequest): Promise<ChargeOutcome> {
    this.charges.push(request);
    const chargeId = `chr_fake_${++this.chargeSeq}`;
    switch (request.tokenId) {
      case FakeGateway.TOKENS.OK:
        return this.paid(chargeId, request);
      case FakeGateway.TOKENS.REQUIRES_3DS:
        return request.authentication3DS ? this.paid(chargeId, request) : { kind: 'requires_3ds' };
      case FakeGateway.TOKENS.DECLINED:
        return {
          kind: 'declined',
          userMessage: 'Tu banco rechazó el pago.',
          chargeId,
          raw: { object: 'error', type: 'card_error', decline_code: 'insufficient_funds', charge_id: chargeId }
        };
      case FakeGateway.TOKENS.ERROR:
        return { kind: 'failed', userMessage: 'No pudimos procesar el pago.', chargeId, raw: { object: 'error', type: 'api_error', charge_id: chargeId } };
      default:
        return { kind: 'unexpected', status: 500, raw: { error: 'respuesta fuera de contrato' } };
    }
  }

  private paid(chargeId: string, request: ChargeRequest): ChargeOutcome {
    return { kind: 'paid', chargeId, amountCents: request.amountCents, method: 'card', raw: { object: 'charge', id: chargeId, amount: request.amountCents } };
  }

  async createOrder(request: PaymentOrderRequest): Promise<CreateOrderOutcome> {
    this.orders.push(request);
    const id = `ord_fake_${++this.orderSeq}`;
    this.orderStates.set(id, { request, state: 'pending' });
    return { ok: true, order: this.order(id) };
  }

  async fetchOrder(orderId: string): Promise<FetchOrderOutcome> {
    if (!this.orderStates.has(orderId)) return { ok: false, status: 404, raw: { object: 'error', type: 'not_found' } };
    return { ok: true, order: this.order(orderId) };
  }

  async refund(request: RefundRequest): Promise<RefundOutcome> {
    this.refunds.push(request);
    if (this.refunded.has(request.chargeId)) {
      return { ok: false, status: 400, message: 'El cargo ya fue devuelto.', raw: { object: 'error', type: 'invalid_request' } };
    }
    this.refunded.add(request.chargeId);
    return { ok: true, refundId: `ref_fake_${++this.refundSeq}` };
  }

  /** Simula que el cliente pagó el código de PagoEfectivo o la billetera. */
  payOrder(orderId: string) {
    this.setState(orderId, 'paid');
  }

  /** Simula el vencimiento de la orden. */
  expireOrder(orderId: string) {
    this.setState(orderId, 'expired');
  }

  private setState(orderId: string, state: PaymentOrderState) {
    const entry = this.orderStates.get(orderId);
    if (!entry) throw new Error(`Orden ${orderId} no existe en FakeGateway`);
    entry.state = state;
  }

  private order(id: string): PaymentOrder {
    const { request, state } = this.orderStates.get(id)!;
    // CIP determinista por orden: ord_fake_3 → 100000003.
    const paymentCode = String(100000000 + Number(id.split('_').pop()));
    return { id, amountCents: request.amountCents, state, paymentCode, expiresAt: request.expiresAt, raw: { object: 'order', id, state, payment_code: paymentCode } };
  }
}
