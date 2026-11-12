import { ConflictError } from '../../../shared/errors';

/** Motivo de un movimiento de stock: ventas, devoluciones, ajustes manuales e ingresos por compra. */
export const STOCK_REASONS = ['sale', 'refund', 'adjustment', 'purchase'] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

/** Regla central del inventario: el stock nunca queda en negativo. */
export class InsufficientStockError extends ConflictError {
  constructor(message = 'El ajuste dejaría el stock en negativo.') {
    super(message, 'insufficient_stock');
  }
}

/** Stock resultante de aplicar `delta`; lanza si quedaría en negativo. */
export function stockAfter(current: number, delta: number): number {
  const next = current + delta;
  if (next < 0) throw new InsufficientStockError();
  return next;
}

/** Línea de pedido que mueve stock. */
export interface StockLine {
  variantId: number;
  quantity: number;
}
