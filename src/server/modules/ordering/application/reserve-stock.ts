import { CARD_RESERVATION_MS } from '../domain/reservation-expiry';
import type { QuoteLine } from '../domain/types';
import { withVariantIds } from './with-variant-ids';
import type { OrderingDeps } from './ports/ports';

/** Tiempo que se promete el stock a un pedido recién creado: lo que dura el pago con tarjeta o Yape (ADR 0005). */
export const DEFAULT_RESERVATION_MS = CARD_RESERVATION_MS;

/**
 * Caso de uso ReservarStock: promete al pedido las unidades de sus líneas sin tocar el stock físico (eso ocurre al
 * confirmar el pago). Las líneas del mismo producto en distintas moliendas se suman en una sola reserva por variante.
 * Debe correr en la misma transacción que crea o modifica el pedido, con las variantes ya bloqueadas.
 */
export async function reserveStock(deps: OrderingDeps, orderId: string, lines: QuoteLine[], expiresAt: Date): Promise<void> {
  const byVariant = new Map<number, number>();
  for (const line of await withVariantIds(deps, lines)) {
    byVariant.set(line.variantId, (byVariant.get(line.variantId) ?? 0) + line.quantity);
  }
  await deps.reservations.replace(
    orderId,
    [...byVariant].map(([variantId, quantity]) => ({ variantId, quantity })),
    expiresAt
  );
}
