import type { Transaction } from '../../shared/unit-of-work';
import { adjustStock, type AdjustStockCommand } from './application/adjust-stock';
import { registerSale } from './application/register-sale';
import { restockOrder } from './application/restock-order';
import type { StockLine } from './domain/stock';
import { createDrizzleStockRepository } from './infrastructure/drizzle-stock-repository';

// API pública del módulo inventory. Raíz de composición: aquí se enlaza el repositorio Drizzle.
// Los casos de uso corren dentro de la transacción del llamador (UnitOfWork), que decide qué más se confirma con ellos.

export type { StockMovement, StockRepository } from './application/ports/stock-repository';
export { InsufficientStockError, STOCK_REASONS, stockAfter, type StockLine, type StockReason } from './domain/stock';

export function inventoryFor(tx: Transaction) {
  const repository = createDrizzleStockRepository(tx);
  return {
    adjustStock: (command: AdjustStockCommand) => adjustStock(repository, command),
    registerSale: (orderId: string, lines: StockLine[]) => registerSale(repository, orderId, lines),
    restockOrder: (orderId: string, adminUserId: number, lines: StockLine[]) => restockOrder(repository, orderId, adminUserId, lines)
  };
}
