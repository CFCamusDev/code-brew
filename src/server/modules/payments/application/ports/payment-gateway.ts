import type { RefundReason } from '../../domain/refund-reason';

// Puerto de la pasarela de pago (ADR 0002). El dominio y los casos de uso hablan con esta interfaz;
// Culqi es un adaptador reemplazable (infrastructure/culqi-gateway.ts) y FakeGateway sirve para pruebas.
// Todos los montos van en céntimos de sol.

export interface ChargeRequest {
  amountCents: number;
  email: string;
  /** Token de tarjeta o de Yape que generó el checkout del navegador. */
  tokenId: string;
  deviceId?: string;
  orderNumber: string;
  orderId: string;
  customer: { fullName: string; phone: string; address: string; city: string };
  /** Parámetros que devuelve la autenticación 3DS del banco, al reintentar el cargo. */
  authentication3DS?: Record<string, string>;
}

/**
 * Resultado de un cargo. `raw` es la respuesta de la pasarela tal cual, para auditoría y conciliación.
 * - paid: cobrado.
 * - requires_3ds: el banco pide autenticación; hay que reintentar con `authentication3DS`.
 * - declined: el banco o la pasarela rechazó el pago (tarjeta, fondos, etc.).
 * - failed: la pasarela devolvió un error que no es un rechazo del banco.
 * - unexpected: respuesta fuera de contrato; no hay nada que registrar del cargo.
 */
export type ChargeOutcome =
  | { kind: 'paid'; chargeId: string; amountCents: number; method: string; raw: unknown }
  | { kind: 'requires_3ds' }
  | { kind: 'declined'; userMessage?: string; chargeId?: string; raw: unknown }
  | { kind: 'failed'; userMessage?: string; chargeId?: string; raw: unknown }
  | { kind: 'unexpected'; status: number; raw: unknown };

export interface PaymentOrderRequest {
  amountCents: number;
  /** Único por intento: la pasarela no acepta repetirlo. */
  orderNumber: string;
  orderId: string;
  expiresAt: Date;
  client: { fullName: string; email: string; phone: string };
}

/** Orden de pago para PagoEfectivo, billeteras, banca móvil y agentes; se confirma por webhook. */
export type PaymentOrderState = 'created' | 'pending' | 'paid' | 'expired' | 'deleted' | 'unknown';

export interface PaymentOrder {
  id: string;
  amountCents: number;
  state: PaymentOrderState;
  /** Código con el que el cliente paga (CIP de PagoEfectivo); null hasta que elige el medio en el checkout. */
  paymentCode: string | null;
  expiresAt: Date | null;
  raw: unknown;
}

export type GatewayFailure = { ok: false; status: number; raw: unknown };

export type CreateOrderOutcome = { ok: true; order: PaymentOrder } | GatewayFailure;
export type FetchOrderOutcome = { ok: true; order: PaymentOrder } | GatewayFailure;

export interface RefundRequest {
  chargeId: string;
  amountCents: number;
  reason: RefundReason;
}

export type RefundOutcome = { ok: true; refundId: string } | (GatewayFailure & { message?: string });

export interface PaymentGateway {
  /** ¿Hay llaves configuradas? Sin ellas el pago en línea queda desactivado. */
  isEnabled(): boolean;
  /** Llave pública que usa el checkout del navegador (no es secreta). */
  publicKey(): string | undefined;
  charge(request: ChargeRequest): Promise<ChargeOutcome>;
  createOrder(request: PaymentOrderRequest): Promise<CreateOrderOutcome>;
  fetchOrder(orderId: string): Promise<FetchOrderOutcome>;
  refund(request: RefundRequest): Promise<RefundOutcome>;
}
