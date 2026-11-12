import type { StockReason } from '../../domain/stock';

export interface StockMovement {
  variantId: number;
  delta: number;
  stockAfter: number;
  reason: StockReason;
  orderId?: string;
  adminUserId?: number;
  note?: string | null;
}

/** Acceso a existencias y al libro de movimientos. Las implementaciones operan dentro de la transacción del llamador. */
export interface StockRepository {
  /**
   * Suma `delta` al stock de forma atómica, solo si el resultado no es negativo.
   * Devuelve el stock resultante, o null si la variante no existe o el stock quedaría en negativo.
   */
  tryApplyDelta(variantId: number, delta: number): Promise<number | null>;
  recordMovement(movement: StockMovement): Promise<void>;
}
