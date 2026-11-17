import { cleanTestStorage, setTestStorageKey, useTestStorageEngine } from '@nanostores/persistent';
import { beforeEach, describe, expect, it } from 'vitest';

// El motor de prueba debe activarse antes de crear el store del carrito.
useTestStorageEngine();
const { addToCart, cartCount, cartLines, clearCart, removeFromCart, setQuantity } = await import('../../src/features/cart/cart');
const { MAX_QUANTITY } = await import('../../src/contracts/limits');

describe('carrito', () => {
  beforeEach(() => {
    cleanTestStorage();
    clearCart();
  });

  it('suma cantidades del mismo sku y molienda', () => {
    addToCart('espresso-250', 'Grano entero');
    addToCart('espresso-250', 'Grano entero', 2);
    addToCart('espresso-250', 'Molido para espresso');
    expect(cartLines.get()).toHaveLength(2);
    expect(cartCount.get()).toBe(4);
  });

  it('no supera la cantidad máxima y elimina al llegar a 0', () => {
    addToCart('espresso-250', 'Grano entero', MAX_QUANTITY + 5);
    expect(cartLines.get()[0].quantity).toBe(MAX_QUANTITY);
    setQuantity('espresso-250', 'Grano entero', 0);
    expect(cartLines.get()).toHaveLength(0);
  });

  it('quita una línea', () => {
    addToCart('pack-developer', 'Ambos en grano');
    removeFromCart('pack-developer', 'Ambos en grano');
    expect(cartLines.get()).toEqual([]);
  });

  it('descarta datos inválidos guardados en el navegador', () => {
    setTestStorageKey('codebrew:cart', JSON.stringify([{ sku: 'ok', grind: 'g', quantity: 1 }, { sku: 'x', quantity: -3 }, 'basura']));
    expect(cartLines.get()).toEqual([{ sku: 'ok', grind: 'g', quantity: 1 }]);
    setTestStorageKey('codebrew:cart', '{no es json');
    expect(cartLines.get()).toEqual([]);
  });

  it('un carrito guardado con los SKU anteriores a Pipeline sigue apuntando a Hotfix', () => {
    setTestStorageKey('codebrew:cart', JSON.stringify([{ sku: 'monteverde-250', grind: 'Grano entero', quantity: 2 }, { sku: 'monteverde-500', grind: 'Grano entero', quantity: 1 }]));
    expect(cartLines.get()).toEqual([
      { sku: 'hotfix-250', grind: 'Grano entero', quantity: 2 },
      { sku: 'hotfix-500', grind: 'Grano entero', quantity: 1 }
    ]);
  });
});
