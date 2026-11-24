import { reservationExpiry } from '../domain/reservation-expiry';
import type { CartLine, QuoteIssue } from '../domain/types';
import { quoteOrder } from './quote-order';
import { reserveStock } from './reserve-stock';
import type { OrderingDeps } from './ports/ports';

export type ExtendReservationResult =
  | { status: 'extended'; expiresAt: Date }
  | { status: 'closed' }
  | { status: 'unavailable'; issues: QuoteIssue[] };

/**
 * Caso de uso ExtenderReserva: al crearse la orden de Culqi (PagoEfectivo o billetera) el pedido puede tardar horas en
 * pagarse, así que su reserva se alarga hasta el vencimiento de esa orden, con tope de 48 h. Nunca la acorta.
 * Si la reserva original ya había vencido, el stock se vuelve a prometer solo si sigue disponible. Debe correr bajo UnitOfWork.
 */
export async function extendReservation(
  deps: OrderingDeps,
  order: { id: string; items: CartLine[]; shippingZoneId: number | null; shippingRegion: string },
  gatewayOrderExpiresAt: Date
): Promise<ExtendReservationResult> {
  const locked = await deps.orders.lockOrder(order.id);
  if (!locked || locked.status !== 'pending') return { status: 'closed' };

  await deps.reservations.lockVariants(order.items.map(item => item.sku));
  const quote = await quoteOrder(deps, order);
  if (quote.issues.length) return { status: 'unavailable', issues: quote.issues };

  const now = deps.clock.now();
  const target = reservationExpiry(now, gatewayOrderExpiresAt);
  const current = await deps.reservations.currentExpiry(order.id, now);
  const expiresAt = current && current > target ? current : target;
  await reserveStock(deps, order.id, quote.lines, expiresAt);
  return { status: 'extended', expiresAt };
}
