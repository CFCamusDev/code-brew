import type { StockLine } from '../domain/stock';
import type { StockRepository } from './ports/stock-repository';

/**
 * Descuenta el stock de las líneas de un pedido pagado, con un asiento por línea.
 * El pago ya se cobró: una línea sin stock suficiente no se descuenta y se informa en `shortage`.
 */
export async function registerSale(repository: StockRepository, orderId: string, lines: StockLine[]): Promise<{ shortage: boolean }> {
  let shortage = false;
  for (const line of lines) {
    const stock = await repository.tryApplyDelta(line.variantId, -line.quantity);
    if (stock === null) {
      shortage = true;
      continue;
    }
    await repository.recordMovement({ variantId: line.variantId, delta: -line.quantity, stockAfter: stock, reason: 'sale', orderId });
  }
  return { shortage };
}
