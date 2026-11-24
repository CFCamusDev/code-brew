/** Lo que dura el pago con tarjeta o Yape: es el tiempo mínimo que se promete el stock a un pedido (ADR 0005). */
export const CARD_RESERVATION_MS = 30 * 60 * 1000;

/** Tope de cualquier reserva: ni siquiera una orden de Culqi más larga aparta stock más de 48 h. */
export const MAX_RESERVATION_MS = 48 * 60 * 60 * 1000;

/**
 * Hasta cuándo se promete el stock de un pedido pendiente.
 * - Sin orden de Culqi (tarjeta o Yape): 30 minutos.
 * - Con orden de Culqi (PagoEfectivo o billetera): hasta que esa orden venza, con tope de 48 h. Nunca menos de 30
 *   minutos, porque mientras tanto el cliente todavía puede pagar con tarjeta.
 */
export function reservationExpiry(now: Date, gatewayOrderExpiresAt?: Date | null): Date {
  const floor = now.getTime() + CARD_RESERVATION_MS;
  if (!gatewayOrderExpiresAt) return new Date(floor);
  const capped = Math.min(gatewayOrderExpiresAt.getTime(), now.getTime() + MAX_RESERVATION_MS);
  return new Date(Math.max(floor, capped));
}
