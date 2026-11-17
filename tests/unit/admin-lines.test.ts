import { describe, expect, it } from 'vitest';
import { lineInput } from '../../src/contracts/admin-lines';

const valid = { name: 'Colección', slug: 'coleccion', description: null, theme: {}, template: 'base', sortOrder: 0 };
describe('entrada del panel de líneas', () => {
  it('acepta identidad, tema seguro y orden', () => {
    expect(lineInput.parse({ ...valid, theme: { '--cb-cream': '#fff' } }).theme).toEqual({ '--cb-cream': '#fff' });
  });
  it.each([
    { slug: '../otra' }, { name: ' ' }, { sortOrder: -1 }, { sortOrder: 1.5 }, { sortOrder: 2147483648 },
    { template: 'arbitraria' }, { theme: { color: 'red' } }, { theme: { '--x': 'url(https://example.com)' } },
    { theme: { '--x': 'red;display:none' } }, { status: 'active' }
  ])('rechaza datos inseguros o estado fuera de la acción autorizada: %j', change => {
    expect(lineInput.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});
