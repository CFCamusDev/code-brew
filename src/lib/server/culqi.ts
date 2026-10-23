import { CULQI_PUBLIC_KEY, CULQI_SECRET_KEY } from 'astro:env/server';

// Cliente mínimo de la API de Culqi v2 (https://apidocs.culqi.com). Montos en céntimos.

const API = 'https://api.culqi.com/v2';

export function culqiEnabled() {
  return Boolean(CULQI_PUBLIC_KEY && CULQI_SECRET_KEY);
}

export function culqiPublicKey() {
  return CULQI_PUBLIC_KEY;
}

export interface CulqiError {
  object: 'error';
  type: string;
  code?: string;
  decline_code?: string;
  charge_id?: string;
  merchant_message?: string;
  user_message?: string;
}

export interface CulqiCharge {
  object: 'charge';
  id: string;
  amount: number;
  currency_code: string;
  paid?: boolean;
  source?: { object?: string; type?: string; id?: string };
  outcome?: { type?: string; code?: string; user_message?: string };
}

export interface CulqiOrder {
  object: 'order';
  id: string;
  amount: number;
  currency_code: string;
  order_number: string;
  /** created | pending | paid | expired | deleted */
  state: string;
  expiration_date: number;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown) {
  if (!CULQI_SECRET_KEY) throw new Error('Culqi no está configurado (falta CULQI_SECRET_KEY)');
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${CULQI_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });
  const data = (await response.json().catch(() => ({}))) as T | CulqiError;
  return { status: response.status, data };
}

export interface ChargeInput {
  amountCents: number;
  email: string;
  tokenId: string;
  deviceId?: string;
  orderNumber: string;
  orderId: string;
  customer: { firstName: string; lastName: string; phone: string; address: string; city: string };
  authentication3DS?: Record<string, string>;
}

/**
 * Crea un cargo con un token de tarjeta o Yape.
 * 201 = pagado · 200 con action_code REVIEW = requiere 3DS · 4xx = rechazado o inválido.
 */
export function createCharge(input: ChargeInput) {
  return request<CulqiCharge & { action_code?: string; user_message?: string }>('POST', '/charges', {
    amount: input.amountCents,
    currency_code: 'PEN',
    email: input.email,
    source_id: input.tokenId,
    capture: true,
    description: `CodeBrew ${input.orderNumber}`,
    antifraud_details: {
      first_name: input.customer.firstName,
      last_name: input.customer.lastName,
      phone_number: input.customer.phone,
      address: input.customer.address,
      address_city: input.customer.city,
      country_code: 'PE',
      ...(input.deviceId ? { device_finger_print_id: input.deviceId } : {})
    },
    metadata: { order_id: input.orderId, order_number: input.orderNumber },
    ...(input.authentication3DS ? { authentication_3DS: input.authentication3DS } : {})
  });
}

export interface OrderInput {
  amountCents: number;
  orderNumber: string;
  orderId: string;
  expiresAt: Date;
  client: { firstName: string; lastName: string; email: string; phone: string };
}

/** Orden de pago para PagoEfectivo, billeteras, banca móvil y agentes; se confirma por webhook. */
export function createOrder(input: OrderInput) {
  return request<CulqiOrder>('POST', '/orders', {
    amount: input.amountCents,
    currency_code: 'PEN',
    description: `Pedido CodeBrew ${input.orderNumber}`,
    order_number: input.orderNumber,
    expiration_date: Math.floor(input.expiresAt.getTime() / 1000),
    client_details: {
      first_name: input.client.firstName,
      last_name: input.client.lastName,
      email: input.client.email,
      phone_number: `+51${input.client.phone}`
    },
    confirm: false,
    metadata: { order_id: input.orderId }
  });
}

export function getOrder(id: string) {
  return request<CulqiOrder>('GET', `/orders/${encodeURIComponent(id)}`);
}

export type RefundReason = 'solicitud_comprador' | 'duplicado' | 'fraudulento';

/** Devolución total o parcial de un cargo (chr_…). */
export function createRefund(chargeId: string, amountCents: number, reason: RefundReason) {
  return request<{ object: 'refund'; id: string; amount: number; charge_id: string }>('POST', '/refunds', {
    amount: amountCents,
    charge_id: chargeId,
    reason
  });
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
