import { NotFoundError } from '../../../shared/errors';
import type { StockLine } from '../domain/stock';
import type { StockRepository } from './ports/stock-repository';

/** Repone el stock de las líneas de un pedido reembolsado, con un asiento por línea. */
export async function restockOrder(repository: StockRepository, orderId: string, adminUserId: number, lines: StockLine[]): Promise<void> {
  for (const line of lines) {
    const stock = await repository.tryApplyDelta(line.variantId, line.quantity);
    if (stock === null) throw new NotFoundError(`La variante ${line.variantId} no existe.`);
    await repository.recordMovement({ variantId: line.variantId, delta: line.quantity, stockAfter: stock, reason: 'refund', orderId, adminUserId });
  }
}
