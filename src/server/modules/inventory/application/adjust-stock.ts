import { InsufficientStockError } from '../domain/stock';
import type { StockRepository } from './ports/stock-repository';

export interface AdjustStockCommand {
  variantId: number;
  delta: number;
  reason: 'adjustment' | 'purchase';
  adminUserId: number;
  note?: string;
}

/** Caso de uso AjustarStock: suma o resta stock y asienta el movimiento. Devuelve el stock resultante. */
export async function adjustStock(repository: StockRepository, command: AdjustStockCommand): Promise<number> {
  const stock = await repository.tryApplyDelta(command.variantId, command.delta);
  if (stock === null) throw new InsufficientStockError();
  await repository.recordMovement({
    variantId: command.variantId,
    delta: command.delta,
    stockAfter: stock,
    reason: command.reason,
    adminUserId: command.adminUserId,
    note: command.note || null
  });
  return stock;
}
