import { describe, expect, it } from 'vitest';
import { formatDateTime, formatOrderNumber, formatPEN } from '../../src/lib/shop/format';

describe('formatPEN', () => {
  it('convierte céntimos a soles con dos decimales', () => {
    expect(formatPEN(3400)).toBe('S/ 34.00');
    expect(formatPEN(5)).toBe('S/ 0.05');
    expect(formatPEN(123456)).toBe('S/ 1,234.56');
  });
});

describe('formatOrderNumber', () => {
  it('rellena con ceros hasta 6 dígitos', () => {
    expect(formatOrderNumber(7)).toBe('CB-000007');
    expect(formatOrderNumber(1234567)).toBe('CB-1234567');
  });
});

describe('formatDateTime', () => {
  it('usa la hora de Lima (UTC-5)', () => {
    expect(formatDateTime('2026-10-23T05:30:00Z')).toContain('00:30');
  });
});
