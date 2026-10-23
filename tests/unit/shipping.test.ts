import { describe, expect, it } from 'vitest';
import { isFreeShipping } from '../../src/lib/shop/shipping';

const lima = { freeFromCents: null, freeFromBags: 3 };
const provincias = { freeFromCents: null, freeFromBags: null };

describe('isFreeShipping', () => {
  it('Lima: gratis desde 3 bolsas', () => {
    expect(isFreeShipping(lima, 9600, 2)).toBe(false);
    expect(isFreeShipping(lima, 9600, 3)).toBe(true);
  });

  it('provincias nunca es gratis sin regla', () => {
    expect(isFreeShipping(provincias, 100000, 10)).toBe(false);
  });

  it('también admite envío gratis por subtotal', () => {
    expect(isFreeShipping({ freeFromCents: 15000, freeFromBags: null }, 14999, 0)).toBe(false);
    expect(isFreeShipping({ freeFromCents: 15000, freeFromBags: null }, 15000, 0)).toBe(true);
  });
});
