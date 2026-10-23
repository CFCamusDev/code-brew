import { describe, expect, it } from 'vitest';
import { isCulqiError, splitName } from '../../src/lib/server/culqi';

describe('splitName', () => {
  it('separa nombres y apellidos como pide Culqi', () => {
    expect(splitName('Ana Pérez')).toEqual({ firstName: 'Ana', lastName: 'Pérez' });
    expect(splitName('Juan Carlos Pérez López')).toEqual({ firstName: 'Juan Carlos', lastName: 'Pérez López' });
    expect(splitName('  Cher ')).toEqual({ firstName: 'Cher', lastName: 'Cher' });
  });
});

describe('isCulqiError', () => {
  it('reconoce los errores de la API', () => {
    expect(isCulqiError({ object: 'error', type: 'card_error' })).toBe(true);
    expect(isCulqiError({ object: 'charge', id: 'chr_1' })).toBe(false);
    expect(isCulqiError(null)).toBe(false);
  });
});
