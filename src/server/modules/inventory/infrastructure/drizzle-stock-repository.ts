import { sql } from 'drizzle-orm';
import type { Transaction } from '../../../shared/unit-of-work';
import { productVariants, stockMovements } from '../../../../lib/server/db/schema';
import type { StockRepository } from '../application/ports/stock-repository';

/** Repositorio sobre la transacción del llamador: el ajuste y su asiento se confirman o se deshacen juntos. */
export function createDrizzleStockRepository(tx: Transaction): StockRepository {
  return {
    async tryApplyDelta(variantId, delta) {
      const [variant] = await tx
        .update(productVariants)
        .set({ stock: sql`${productVariants.stock} + ${delta}` })
        .where(sql`${productVariants.id} = ${variantId} and ${productVariants.stock} + ${delta} >= 0`)
        .returning({ stock: productVariants.stock });
      return variant?.stock ?? null;
    },
    async recordMovement(movement) {
      await tx.insert(stockMovements).values({
        variantId: movement.variantId,
        delta: movement.delta,
        stockAfter: movement.stockAfter,
        reason: movement.reason,
        orderId: movement.orderId,
        adminUserId: movement.adminUserId,
        note: movement.note ?? null
      });
    }
  };
}
