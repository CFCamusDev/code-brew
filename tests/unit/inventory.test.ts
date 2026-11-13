import { describe, expect, it } from 'vitest';
import { adjustStock } from '../../src/server/modules/inventory/application/adjust-stock';
import type { StockMovement, StockRepository } from '../../src/server/modules/inventory/application/ports/stock-repository';
import { registerSale } from '../../src/server/modules/inventory/application/register-sale';
import { restockOrder } from '../../src/server/modules/inventory/application/restock-order';
import { InsufficientStockError, stockAfter } from '../../src/server/modules/inventory/domain/stock';

/** Repositorio en memoria con la misma regla que el real: nunca aplica un delta que deje stock negativo. */
function memoryRepository(stock: Record<number, number>) {
  const movements: StockMovement[] = [];
  const repository: StockRepository = {
    async tryApplyDelta(variantId, delta) {
      const current = stock[variantId];
      if (current === undefined || current + delta < 0) return null;
      return (stock[variantId] = current + delta);
    },
    async recordMovement(movement) {
      movements.push(movement);
    }
  };
  return { repository, movements, stock };
}

describe('stockAfter (dominio)', () => {
  it('suma y resta, y nunca deja negativo', () => {
    expect(stockAfter(5, 4)).toBe(9);
    expect(stockAfter(5, -5)).toBe(0);
    expect(() => stockAfter(1, -2)).toThrow(InsufficientStockError);
  });
});

describe('AjustarStock', () => {
  it('aplica el ajuste y asienta el movimiento con motivo, usuario y nota', async () => {
    const { repository, movements } = memoryRepository({ 1: 1 });
    expect(await adjustStock(repository, { variantId: 1, delta: 4, reason: 'purchase', adminUserId: 7, note: 'Lote' })).toBe(5);
    expect(movements).toEqual([{ variantId: 1, delta: 4, stockAfter: 5, reason: 'purchase', adminUserId: 7, note: 'Lote' }]);
  });

  it('rechaza el ajuste que dejaría stock negativo, sin asiento ni cambio', async () => {
    const { repository, movements, stock } = memoryRepository({ 1: 1 });
    await expect(adjustStock(repository, { variantId: 1, delta: -5, reason: 'adjustment', adminUserId: 7 })).rejects.toThrow(InsufficientStockError);
    expect(movements).toEqual([]);
    expect(stock[1]).toBe(1);
  });
});

describe('RegistrarVenta', () => {
  it('descuenta cada línea con un asiento de venta', async () => {
    const { repository, movements, stock } = memoryRepository({ 1: 5, 2: 3 });
    const result = await registerSale(repository, 'o-1', [{ variantId: 1, quantity: 2 }, { variantId: 2, quantity: 3 }]);
    expect(result).toEqual({ shortage: false });
    expect(stock).toEqual({ 1: 3, 2: 0 });
    expect(movements.map(m => [m.variantId, m.delta, m.stockAfter, m.reason, m.orderId])).toEqual([
      [1, -2, 3, 'sale', 'o-1'],
      [2, -3, 0, 'sale', 'o-1']
    ]);
  });

  it('si falta stock no descuenta esa línea, sigue con las demás e informa el faltante', async () => {
    const { repository, movements, stock } = memoryRepository({ 1: 1, 2: 5 });
    const result = await registerSale(repository, 'o-1', [{ variantId: 1, quantity: 3 }, { variantId: 2, quantity: 1 }]);
    expect(result).toEqual({ shortage: true });
    expect(stock).toEqual({ 1: 1, 2: 4 });
    expect(movements).toHaveLength(1);
  });
});

describe('ReponerPedido', () => {
  it('repone cada línea con un asiento de devolución', async () => {
    const { repository, movements, stock } = memoryRepository({ 1: 0 });
    await restockOrder(repository, 'o-1', 9, [{ variantId: 1, quantity: 2 }]);
    expect(stock[1]).toBe(2);
    expect(movements).toEqual([{ variantId: 1, delta: 2, stockAfter: 2, reason: 'refund', orderId: 'o-1', adminUserId: 9 }]);
  });

  it('falla si la variante ya no existe', async () => {
    const { repository } = memoryRepository({});
    await expect(restockOrder(repository, 'o-1', 9, [{ variantId: 1, quantity: 2 }])).rejects.toThrow(/no existe/);
  });
});
