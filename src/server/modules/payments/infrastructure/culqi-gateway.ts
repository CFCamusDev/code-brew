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
import type { GatewayTransaction } from '../domain/reconciliation';

// Adaptador de la API de Culqi v2 (https://apidocs.culqi.com). Montos en céntimos.

const API = 'https://api.culqi.com/v2';
// Listados para conciliar: 100 por página y hasta 50 páginas (5 000 cargos u órdenes por consulta).
const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 50;

interface CulqiError {
  object: 'error';
  type: string;
  code?: string;
  decline_code?: string;
  charge_id?: string;
  merchant_message?: string;
  user_message?: string;
}

interface CulqiCharge {
  object: 'charge';
  id: string;
  amount: number;
  currency_code: string;
  paid?: boolean;
  source?: { object?: string; type?: string; id?: string };
  action_code?: string;
  user_message?: string;
  amount_refunded?: number;
  outcome?: { type?: string };
  metadata?: Record<string, unknown>;
  /** Segundos desde 1970. */
  creation_date?: number;
}

interface CulqiOrder {
  object: 'order';
  id: string;
  amount: number;
  currency_code: string;
  order_number: string;
  /** created | pending | paid | expired | deleted */
  state: string;
  expiration_date: number;
  /** CIP: aparece cuando el cliente confirma la orden eligiendo agentes, banca o billetera. */
  payment_code?: string | null;
  metadata?: Record<string, unknown>;
  /** Segundos desde 1970. */
  creation_date?: number;
}

interface CulqiList<T> {
  data: T[];
  paging?: { cursors?: { before?: string; after?: string } };
}

export function isCulqiError(data: unknown): data is CulqiError {
  return typeof data === 'object' && data !== null && (data as { object?: string }).object === 'error';
}

/** Culqi exige nombre y apellido por separado. */
export function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts.slice(0, Math.ceil(parts.length / 2)).join(' '), lastName: parts.slice(Math.ceil(parts.length / 2)).join(' ') };
}

const ORDER_STATES: PaymentOrderState[] = ['created', 'pending', 'paid', 'expired', 'deleted'];

function toOrder(data: CulqiOrder): PaymentOrder {
  const state = ORDER_STATES.find(candidate => candidate === data.state) ?? 'unknown';
  return {
    id: data.id,
    amountCents: data.amount,
    state,
    paymentCode: data.payment_code ? String(data.payment_code) : null,
    expiresAt: data.expiration_date ? new Date(data.expiration_date * 1000) : null,
    raw: data
  };
}

export interface CulqiGatewayConfig {
  publicKey?: string;
  secretKey?: string;
  /** Inyectable para pruebas. */
  fetch?: typeof fetch;
}

export class CulqiGateway implements PaymentGateway {
  private readonly http: typeof fetch;

  constructor(private readonly config: CulqiGatewayConfig) {
    this.http = config.fetch ?? fetch;
  }

  isEnabled() {
    return Boolean(this.config.publicKey && this.config.secretKey);
  }

  publicKey() {
    return this.config.publicKey;
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown) {
    if (!this.config.secretKey) throw new Error('Culqi no está configurado (falta CULQI_SECRET_KEY)');
    const response = await this.http(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.config.secretKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000)
    });
    const data = (await response.json().catch(() => ({}))) as T | CulqiError;
    return { status: response.status, data };
  }

  /** 201 = pagado · 200 con action_code REVIEW = requiere 3DS · 4xx = rechazado o inválido. */
  async charge(input: ChargeRequest): Promise<ChargeOutcome> {
    const { firstName, lastName } = splitName(input.customer.fullName);
    const { status, data } = await this.request<CulqiCharge>('POST', '/charges', {
      amount: input.amountCents,
      currency_code: 'PEN',
      email: input.email,
      source_id: input.tokenId,
      capture: true,
      description: `CodeBrew ${input.orderNumber}`,
      antifraud_details: {
        first_name: firstName,
        last_name: lastName,
        phone_number: input.customer.phone,
        address: input.customer.address,
        address_city: input.customer.city,
        country_code: 'PE',
        ...(input.deviceId ? { device_finger_print_id: input.deviceId } : {})
      },
      metadata: { order_id: input.orderId, order_number: input.orderNumber },
      ...(input.authentication3DS ? { authentication_3DS: input.authentication3DS } : {})
    });

    if (isCulqiError(data)) {
      // La documentación indica card_error (402); el sandbox responde operacion_denegada (400) con decline_code.
      const declined = data.type === 'card_error' || data.type === 'operacion_denegada' || Boolean(data.decline_code);
      return { kind: declined ? 'declined' : 'failed', userMessage: data.user_message, chargeId: data.charge_id, raw: data };
    }
    if (status === 201) {
      return { kind: 'paid', chargeId: data.id, amountCents: data.amount, method: data.source?.type ?? 'card', raw: data };
    }
    if (status === 200 && data.action_code === 'REVIEW') return { kind: 'requires_3ds' };
    return { kind: 'unexpected', status, raw: data };
  }

  async createOrder(input: PaymentOrderRequest): Promise<CreateOrderOutcome> {
    const { firstName, lastName } = splitName(input.client.fullName);
    const { status, data } = await this.request<CulqiOrder>('POST', '/orders', {
      amount: input.amountCents,
      currency_code: 'PEN',
      description: `Pedido CodeBrew ${input.orderNumber}`,
      order_number: input.orderNumber,
      expiration_date: Math.floor(input.expiresAt.getTime() / 1000),
      client_details: {
        first_name: firstName,
        last_name: lastName,
        email: input.client.email,
        phone_number: `+51${input.client.phone}`
      },
      confirm: false,
      metadata: { order_id: input.orderId }
    });
    if (status === 201 && !isCulqiError(data)) return { ok: true, order: toOrder(data) };
    return { ok: false, status, raw: data };
  }

  async fetchOrder(orderId: string): Promise<FetchOrderOutcome> {
    const { status, data } = await this.request<CulqiOrder>('GET', `/orders/${encodeURIComponent(orderId)}`);
    if (status === 200 && !isCulqiError(data)) return { ok: true, order: toOrder(data) };
    return { ok: false, status, raw: data };
  }

  async refund(input: RefundRequest): Promise<RefundOutcome> {
    const { status, data } = await this.request<{ object: 'refund'; id: string }>('POST', '/refunds', {
      amount: input.amountCents,
      charge_id: input.chargeId,
      reason: input.reason
    });
    if (status === 201 && !isCulqiError(data)) return { ok: true, refundId: data.id };
    return { ok: false, status, message: isCulqiError(data) ? data.merchant_message : undefined, raw: data };
  }

  /** Recorre una lista de Culqi página por página (cursor `after`) dentro del rango de fechas de creación. */
  private async listAll<T extends { id: string }>(resource: 'charges' | 'orders', range: { from: Date; to: Date }): Promise<T[]> {
    const items: T[] = [];
    const base = `/${resource}?limit=${LIST_PAGE_SIZE}&creation_date_from=${Math.floor(range.from.getTime() / 1000)}&creation_date_to=${Math.floor(range.to.getTime() / 1000)}`;
    let after: string | undefined;
    for (let page = 0; page < LIST_MAX_PAGES; page++) {
      const { status, data } = await this.request<CulqiList<T>>('GET', after ? `${base}&after=${encodeURIComponent(after)}` : base);
      if (status !== 200 || isCulqiError(data)) throw new Error(`Culqi no pudo listar ${resource} (${status})`);
      items.push(...data.data);
      after = data.paging?.cursors?.after;
      if (data.data.length < LIST_PAGE_SIZE || !after) return items;
    }
    throw new Error(`Culqi devolvió más de ${LIST_PAGE_SIZE * LIST_MAX_PAGES} ${resource}: acorta el rango de fechas`);
  }

  async listTransactions(range: { from: Date; to: Date }): Promise<GatewayTransaction[]> {
    const [charges, orders] = await Promise.all([this.listAll<CulqiCharge>('charges', range), this.listAll<CulqiOrder>('orders', range)]);
    return [
      ...charges.map((charge): GatewayTransaction => {
        const refunded = (charge.amount_refunded ?? 0) >= charge.amount && charge.amount > 0;
        const paid = charge.paid === true || charge.outcome?.type === 'venta_exitosa';
        return {
          reference: charge.id,
          kind: 'charge',
          amountCents: charge.amount,
          state: refunded ? 'refunded' : paid ? 'paid' : 'other',
          orderId: typeof charge.metadata?.order_id === 'string' ? charge.metadata.order_id : null,
          createdAt: new Date((charge.creation_date ?? 0) * 1000)
        };
      }),
      ...orders.map((order): GatewayTransaction => {
        const state = toOrder(order).state;
        return {
          reference: order.id,
          kind: 'order',
          amountCents: order.amount,
          state: state === 'paid' || state === 'pending' || state === 'expired' || state === 'deleted' ? state : 'other',
          orderId: typeof order.metadata?.order_id === 'string' ? order.metadata.order_id : null,
          createdAt: new Date((order.creation_date ?? 0) * 1000)
        };
      })
    ];
  }
}
