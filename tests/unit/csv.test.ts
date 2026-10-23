import { describe, expect, it } from 'vitest';
import { soles, toCsv } from '../../src/lib/server/csv';

describe('toCsv', () => {
  it('empieza con BOM y usa CRLF', () => {
    const csv = toCsv(['a', 'b'], [[1, 'x']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿a,b\r\n1,x\r\n');
  });

  it('entrecomilla comas, comillas y saltos de línea', () => {
    const csv = toCsv(['nota'], [['Av. Larco 123, Miraflores'], ['dijo "hola"'], ['línea 1\nlínea 2']]);
    expect(csv).toContain('"Av. Larco 123, Miraflores"');
    expect(csv).toContain('"dijo ""hola"""');
    expect(csv).toContain('"línea 1\nlínea 2"');
  });

  it('neutraliza fórmulas escritas por clientes', () => {
    const csv = toCsv(['nombre'], [['=HYPERLINK("http://x")'], ['+51 987'], ['@SUM(A1)'], ['-2']]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).toContain("'+51 987");
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).toContain("'-2");
  });

  it('deja vacíos los valores nulos y no toca los números', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, -5]])).toContain(',,-5');
  });
});

describe('soles', () => {
  it('convierte céntimos a soles con dos decimales', () => {
    expect(soles(3400)).toBe('34.00');
    expect(soles(5)).toBe('0.05');
  });
});
