import { describe, expect, it } from 'vitest';
import { createProductInput, editProductInput } from '../../src/contracts/admin-products';

const basic = { name: 'QA Café', roast: 'Medio', grinds: ['Grano entero'], imageUrl: null };
describe('contratos de administración de productos', () => {
  it('conserva altas antiguas como borradores y admite los metadatos nuevos', () => {
    expect(createProductInput.parse(basic)).toMatchObject({ status: 'draft', lineId: null });
    expect(createProductInput.parse({ ...basic, lineId: 1, tagline: 'Muy pronto', status: 'upcoming', releaseNumber: 6, launchAt: '2027-01-01T12:00:00-05:00' }).releaseNumber).toBe(6);
  });
  it.each([{ releaseNumber: 0 }, { releaseNumber: 1.5 }, { lineId: -1 }, { launchAt: 'mañana' }, { launchAt: '2027-02-30T12:00:00Z' }, { status: 'otro' }, { active: true }])('rechaza metadatos inválidos: %j', change => {
    expect(createProductInput.safeParse({ ...basic, ...change }).success).toBe(false);
  });
  it('no mezcla el indicador legado con una transición de estado', () => {
    expect(editProductInput.safeParse({ ...basic, active: true }).success).toBe(true);
    expect(editProductInput.safeParse({ ...createProductInput.parse(basic), active: true }).success).toBe(false);
  });
});
