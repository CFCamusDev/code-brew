import type { OrderingDeps } from './ports/ports';

/**
 * Caso de uso LiberarReservas: un pedido cancelado deja de apartar stock de inmediato, sin esperar a que venza.
 * Idempotente. Debe correr en la misma transacción que cancela el pedido.
 */
export async function releaseReservations(deps: OrderingDeps, orderIds: string[]): Promise<void> {
  if (!orderIds.length) return;
  await deps.reservations.release(orderIds, deps.clock.now());
}
