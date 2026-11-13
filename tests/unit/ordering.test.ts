import { describe, expect, it } from 'vitest';
import { createOrder } from '../../src/server/modules/ordering/application/create-order';
import type { NewOrder, OrderingDeps, OrderLineRecord } from '../../src/server/modules/ordering/application/ports/ports';
import { quoteCartUseCase } from '../../src/server/modules/ordering/application/quote-cart';
import { updateOrderItems } from '../../src/server/modules/ordering/application/update-order-items';
import { quoteCart, type ShippingRules } from '../../src/server/modules/ordering/domain/cart-quote';
import { CartIssuesError, type CatalogVariant, type OrderCustomer } from '../../src/server/modules/ordering/domain/types';

const variant = (overrides: Partial<CatalogVariant> = {}): CatalogVariant => ({
  variantId: 1, sku: 'espresso-250', format: '250 g', priceCents: 3200, stock: 10, bags: 1, variantActive: true,
  productName: 'Espresso', grinds: ['Grano entero', 'Espresso'], productActive: true, ...overrides
});

/** Envío simple: S/ 12, gratis desde 3 bolsas, solo atiende Lima en la zona "lima". */
const shipping: ShippingRules = {
  zones: [{ slug: 'lima', name: 'Lima', eta: '1-2 días', priceCents: 1200, freeFromCents: null, freeFromBags: 3, regions: ['Lima'], hasRegionRates: false }],
  calculate: ({ zoneSlug, region, bags }) => {
    if (zoneSlug !== 'lima') return { status: 'no_zone' };
    if (region && region !== 'Lima') return { status: 'region_not_served', message: 'Lima no atiende ' + region + '. Elige otra zona de envío.' };
    return { status: 'ok', shippingCents: bags >= 3 ? 0 : 1200 };
  }
};
const lima = { zoneSlug: 'lima', region: 'Lima' };
const line = (quantity: number, sku = 'espresso-250', grind = 'Espresso') => ({ sku, grind, quantity });

describe('CotizarCarrito (dominio)', () => {
  it('calcula subtotal, envío y total con precios del catálogo', () => {
    const quote = quoteCart([line(2)], [variant()], shipping, lima);
    expect(quote).toMatchObject({ subtotalCents: 6400, shippingCents: 1200, totalCents: 7600, bags: 2, issues: [] });
    expect(quote.lines[0]).toMatchObject({ unitPriceCents: 3200, lineTotalCents: 6400, productName: 'Espresso' });
  });

  it('envío gratis desde 3 bolsas', () => {
    expect(quoteCart([line(3)], [variant()], shipping, lima)).toMatchObject({ shippingCents: 0, totalCents: 9600 });
  });

  it('sin zona elegida no hay envío ni total', () => {
    expect(quoteCart([line(1)], [variant()], shipping, {})).toMatchObject({ shippingCents: null, totalCents: null, subtotalCents: 3200 });
  });

  it('reporta producto inexistente o inactivo', () => {
    expect(quoteCart([line(1, 'nada')], [], shipping, lima).issues).toEqual([{ sku: 'nada', message: 'Este producto ya no está disponible.' }]);
    expect(quoteCart([line(1)], [variant({ variantActive: false })], shipping, lima).lines).toEqual([]);
  });

  it('reporta molienda no disponible', () => {
    const quote = quoteCart([line(1, 'espresso-250', 'Turca')], [variant()], shipping, lima);
    expect(quote.issues[0].message).toBe('La molienda "Turca" no está disponible para Espresso.');
  });

  it('mensajes de stock: agotado, una unidad y varias; una sola vez por sku aunque haya varias líneas', () => {
    expect(quoteCart([line(1)], [variant({ stock: 0 })], shipping, lima).issues[0].message).toBe('Espresso 250 g está agotado por ahora.');
    expect(quoteCart([line(2)], [variant({ stock: 1 })], shipping, lima).issues[0].message).toBe('Solo queda 1 unidad de Espresso 250 g.');
    const split = quoteCart([line(2), line(2, 'espresso-250', 'Grano entero')], [variant({ stock: 3 })], shipping, lima);
    expect(split.issues).toEqual([{ sku: 'espresso-250', message: 'Solo quedan 3 unidades de Espresso 250 g.' }]);
    expect(split.lines).toEqual([]);
  });

  it('suma la cantidad pedida del mismo sku en varias moliendas contra el stock', () => {
    const quote = quoteCart([line(3), line(3, 'espresso-250', 'Grano entero')], [variant({ stock: 5 })], shipping, lima);
    expect(quote.issues).toHaveLength(1);
  });

  it('departamento que la zona no atiende se reporta como problema', () => {
    const quote = quoteCart([line(1)], [variant()], shipping, { zoneSlug: 'lima', region: 'Cusco' });
    expect(quote.issues).toEqual([{ sku: '', message: 'Lima no atiende Cusco. Elige otra zona de envío.' }]);
    expect(quote.shippingCents).toBeNull();
  });
});

/** Dependencias en memoria para los casos de uso. */
function memoryDeps(variants: CatalogVariant[], orderStatus = 'pending') {
  const inserted: NewOrder[] = [];
  const items: { orderId: string; lines: OrderLineRecord[] }[] = [];
  const totals: Record<string, unknown>[] = [];
  const deps: OrderingDeps = {
    catalog: { findVariants: async skus => variants.filter(v => skus.includes(v.sku)) },
    shipping: { load: async () => shipping },
    orders: {
      findActiveZoneBySlug: async slug => (slug === 'lima' ? { id: 5, name: 'Lima' } : null),
      findZoneSlugById: async id => (id === 5 ? 'lima' : null),
      insertOrder: async order => (inserted.push(order), { id: 'o-1', number: 42 }),
      lockOrder: async id => (id === 'o-1' ? { status: orderStatus, shippingZoneId: 5, shippingRegion: 'Lima' } : null),
      replaceItems: async (orderId, lines) => void items.push({ orderId, lines }),
      updateTotals: async (_id, t) => void totals.push(t)
    }
  };
  return { deps, inserted, items, totals };
}

const customer: OrderCustomer = {
  name: 'Ana', email: 'ana@example.com', phone: '987654321', zone: 'lima', region: 'Lima', city: 'Lima', district: 'Miraflores', address: 'Av. Siempre Viva 123'
};

describe('CotizarCarrito (caso de uso)', () => {
  it('consulta catálogo y envío por los puertos', async () => {
    const { deps } = memoryDeps([variant()]);
    const quote = await quoteCartUseCase(deps, [line(1)], lima);
    expect(quote.totalCents).toBe(4400);
    expect(quote.zones.map(z => z.slug)).toEqual(['lima']);
  });

  it('un carrito vacío no consulta el catálogo', async () => {
    const { deps } = memoryDeps([variant()]);
    expect(await quoteCartUseCase(deps, [], lima)).toMatchObject({ lines: [], subtotalCents: 0 });
  });
});

describe('CrearPedido', () => {
  it('guarda el pedido con totales del servidor y líneas con su variante', async () => {
    const { deps, inserted, items } = memoryDeps([variant({ variantId: 9 })]);
    const order = await createOrder(deps, [line(2)], customer);
    expect(order).toEqual({ id: 'o-1', number: 42 });
    expect(inserted[0]).toMatchObject({ zone: { id: 5, name: 'Lima' }, subtotalCents: 6400, shippingCents: 1200, totalCents: 7600 });
    expect(items[0].lines[0]).toMatchObject({ variantId: 9, quantity: 2, lineTotalCents: 6400 });
  });

  it('rechaza un carrito con problemas sin escribir nada', async () => {
    const { deps, inserted } = memoryDeps([variant({ stock: 1 })]);
    await expect(createOrder(deps, [line(2)], customer)).rejects.toBeInstanceOf(CartIssuesError);
    expect(inserted).toEqual([]);
  });

  it('rechaza una zona que no existe', async () => {
    const { deps, inserted } = memoryDeps([variant()]);
    await expect(createOrder(deps, [line(1)], { ...customer, zone: 'luna' })).rejects.toThrow(CartIssuesError);
    expect(inserted).toEqual([]);
  });
});

describe('ActualizarLineasDePedido', () => {
  it('reemplaza líneas y actualiza totales', async () => {
    const { deps, items, totals } = memoryDeps([variant()]);
    const summary = await updateOrderItems(deps, 'o-1', [line(1)]);
    expect(summary).toMatchObject({ subtotalCents: 3200, shippingCents: 1200, totalCents: 4400 });
    expect(items).toHaveLength(1);
    expect(totals).toEqual([{ subtotalCents: 3200, shippingCents: 1200, totalCents: 4400 }]);
  });

  it('no modifica pedidos que ya no están pendientes ni inexistentes', async () => {
    const paid = memoryDeps([variant()], 'paid');
    await expect(updateOrderItems(paid.deps, 'o-1', [line(1)])).rejects.toMatchObject({
      issues: [{ sku: '', message: 'Este pedido ya no se puede modificar.' }]
    });
    await expect(updateOrderItems(memoryDeps([variant()]).deps, 'otro', [line(1)])).rejects.toThrow(CartIssuesError);
    expect(paid.items).toEqual([]);
  });

  it('si no hay stock suficiente, no toca el pedido', async () => {
    const { deps, items, totals } = memoryDeps([variant({ stock: 0 })]);
    await expect(updateOrderItems(deps, 'o-1', [line(1)])).rejects.toBeInstanceOf(CartIssuesError);
    expect(items).toEqual([]);
    expect(totals).toEqual([]);
  });
});
