import { describe, expect, it } from 'vitest';
import { calculateShipping } from '../../src/server/modules/shipping/application/calculate-shipping';
import { listZones } from '../../src/server/modules/shipping/application/list-zones';
import { servesRegion, shippingCost, zoneRate, type ShippingZone } from '../../src/server/modules/shipping/domain/shipping-zone';

const lima: ShippingZone = {
  slug: 'lima', name: 'Lima', eta: '1-2 días', priceCents: 1200, freeFromCents: null, freeFromBags: 3,
  regions: ['Lima'], regionRates: []
};
const provincias: ShippingZone = {
  slug: 'provincias', name: 'Provincias', eta: '3-5 días', priceCents: 2000, freeFromCents: 20000, freeFromBags: null,
  regions: null, regionRates: [{ region: 'Cusco', priceCents: 2800 }]
};
const zones = [lima, provincias];

describe('reglas de envío (dominio)', () => {
  it('usa la tarifa del departamento y, si no hay, la base', () => {
    expect(zoneRate(provincias, 'Cusco')).toBe(2800);
    expect(zoneRate(provincias, 'Piura')).toBe(2000);
    expect(zoneRate(provincias, undefined)).toBe(2000);
  });

  it('servesRegion: null atiende todo; una lista restringe', () => {
    expect(servesRegion(provincias, 'Piura')).toBe(true);
    expect(servesRegion(lima, 'Lima')).toBe(true);
    expect(servesRegion(lima, 'Cusco')).toBe(false);
    expect(servesRegion(lima, undefined)).toBe(true);
  });

  it('shippingCost: gratis por bolsas o por subtotal', () => {
    expect(shippingCost(lima, 'Lima', 9600, 2)).toBe(1200);
    expect(shippingCost(lima, 'Lima', 9600, 3)).toBe(0);
    expect(shippingCost(provincias, 'Cusco', 19999, 1)).toBe(2800);
    expect(shippingCost(provincias, 'Cusco', 20000, 1)).toBe(0);
  });
});

describe('CalcularEnvio', () => {
  it('calcula el costo de la zona elegida', () => {
    expect(calculateShipping(zones, { zoneSlug: 'provincias', region: 'Cusco', subtotalCents: 5000, bags: 1 })).toMatchObject({
      status: 'ok', shippingCents: 2800
    });
  });

  it('sin zona o con zona inexistente no calcula', () => {
    expect(calculateShipping(zones, { subtotalCents: 5000, bags: 1 })).toEqual({ status: 'no_zone' });
    expect(calculateShipping(zones, { zoneSlug: 'luna', subtotalCents: 5000, bags: 1 })).toEqual({ status: 'no_zone' });
  });

  it('rechaza un departamento que la zona no atiende', () => {
    const result = calculateShipping(zones, { zoneSlug: 'lima', region: 'Cusco', subtotalCents: 5000, bags: 1 });
    expect(result).toMatchObject({ status: 'region_not_served', message: 'Lima no atiende Cusco. Elige otra zona de envío.' });
  });
});

describe('ListarZonas', () => {
  it('resume las zonas e indica cuáles tienen tarifas por departamento', async () => {
    const { summaries, zones: all } = await listZones({ listActive: async () => zones });
    expect(all).toEqual(zones);
    expect(summaries.map(z => [z.slug, z.hasRegionRates])).toEqual([['lima', false], ['provincias', true]]);
    expect(summaries[0]).not.toHaveProperty('regionRates');
  });
});
