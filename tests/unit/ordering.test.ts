import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/server/shared/clock';
import { createOrder } from '../../src/server/modules/ordering/application/create-order';
import type { NewOrder, OrderingDeps, OrderLineRecord } from '../../src/server/modules/ordering/application/ports/ports';
import { quoteCartUseCase } from '../../src/server/modules/ordering/application/quote-cart';
import { updateOrderItems } from '../../src/server/modules/ordering/application/update-order-items';
import { quoteOrder } from '../../src/server/modules/ordering/application/quote-order';
import { availableStock, quoteCart, type ShippingRules } from '../../src/server/modules/ordering/domain/cart-quote';
import { CartIssuesError, type CatalogVariant, type OrderCustomer } from '../../src/server/modules/ordering/domain/types';

const variant = (overrides: Partial<CatalogVariant> = {}): CatalogVariant => ({
  variantId: 1, sku: 'espresso-250', format: '250 g', priceCents: 3200, stock: 10, reserved: 0, bags: 1, variantActive: true,
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
interface MemoryReservation { orderId: string; variantId: number; quantity: number; expiresAt: Date }

function memoryDeps(variants: CatalogVariant[], orderStatus = 'pending', clock = new FixedClock(new Date('2026-11-17T10:00:00Z'))) {
  const inserted: NewOrder[] = [];
  const items: { orderId: string; lines: OrderLineRecord[] }[] = [];
  const totals: Record<string, unknown>[] = [];
  const reservations: MemoryReservation[] = [];
  const locks: string[][] = [];
  const deps: OrderingDeps = {
    clock,
    catalog: {
      // Como la consulta real: reservas vigentes (sin vencer a `now`) de otros pedidos.
      findVariants: async (skus, { now, excludeOrderId }) =>
        variants
          .filter(v => skus.includes(v.sku))
          .map(v => ({
            ...v,
            reserved: reservations
              .filter(r => r.variantId === v.variantId && r.expiresAt > now && r.orderId !== excludeOrderId)
              .reduce((sum, r) => sum + r.quantity, 0)
          }))
    },
    shipping: { load: async () => shipping },
    reservations: {
      lockVariants: async skus => void locks.push(skus),
      replace: async (orderId, lines, expiresAt) => {
        for (let i = reservations.length - 1; i >= 0; i--) if (reservations[i].orderId === orderId) reservations.splice(i, 1);
        reservations.push(...lines.map(l => ({ orderId, variantId: l.variantId, quantity: l.quantity, expiresAt })));
      },
      currentExpiry: async (orderId, now) => {
        const live = reservations.filter(r => r.orderId === orderId && r.expiresAt > now).map(r => r.expiresAt.getTime());
        return live.length ? new Date(Math.max(...live)) : null;
      }
    },
    orders: {
      findActiveZoneBySlug: async slug => (slug === 'lima' ? { id: 5, name: 'Lima' } : null),
      findZoneSlugById: async id => (id === 5 ? 'lima' : null),
      insertOrder: async order => (inserted.push(order), inserted.length === 1 ? { id: 'o-1', number: 42 } : { id: `o-${inserted.length}`, number: 41 + inserted.length }),
      lockOrder: async id => (id.startsWith('o-') ? { status: orderStatus, shippingZoneId: 5, shippingRegion: 'Lima' } : null),
      replaceItems: async (orderId, lines) => void items.push({ orderId, lines }),
      updateTotals: async (_id, t) => void totals.push(t)
    }
  };
  return { deps, inserted, items, totals, reservations, locks, clock };
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

describe('ReservarStock (dentro de CrearPedido)', () => {
  const MIN = 60 * 1000;

  it('disponible = físico − reservas vigentes, y el mensaje habla de lo disponible', () => {
    expect(availableStock({ stock: 5, reserved: 2 })).toBe(3);
    expect(availableStock({ stock: 1, reserved: 3 })).toBe(0);
    const quote = quoteCart([line(3)], [variant({ stock: 5, reserved: 3 })], shipping, lima);
    expect(quote.issues).toEqual([{ sku: 'espresso-250', message: 'Solo quedan 2 unidades de Espresso 250 g.' }]);
    expect(quoteCart([line(1)], [variant({ stock: 2, reserved: 2 })], shipping, lima).issues[0].message).toBe('Espresso 250 g está agotado por ahora.');
  });

  it('reserva las unidades del pedido por 30 minutos, sin tocar el stock físico', async () => {
    const { deps, reservations, clock } = memoryDeps([variant({ variantId: 9, stock: 3 })]);
    await createOrder(deps, [line(2)], customer);
    expect(reservations).toEqual([{ orderId: 'o-1', variantId: 9, quantity: 2, expiresAt: new Date(clock.now().getTime() + 30 * MIN) }]);
    // El stock físico es el del catálogo: reservar no lo modifica.
    expect((await deps.catalog.findVariants(['espresso-250'], { now: clock.now() }))[0]).toMatchObject({ stock: 3, reserved: 2 });
  });

  it('bloquea las variantes antes de mirar la disponibilidad', async () => {
    const { deps, locks } = memoryDeps([variant()]);
    await createOrder(deps, [line(1), line(1, 'espresso-250', 'Grano entero')], customer);
    expect(locks).toEqual([['espresso-250', 'espresso-250']]);
  });

  it('suma las moliendas del mismo producto en una sola reserva por variante', async () => {
    const { deps, reservations } = memoryDeps([variant({ variantId: 9 })]);
    await createOrder(deps, [line(1), line(2, 'espresso-250', 'Grano entero')], customer);
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({ variantId: 9, quantity: 3 });
  });

  it('el último ítem: el primer pedido se crea y el segundo falla con un mensaje claro, sin crearse', async () => {
    const { deps, inserted, reservations } = memoryDeps([variant({ variantId: 9, stock: 1 })]);
    await createOrder(deps, [line(1)], customer);
    const error = await createOrder(deps, [line(1)], customer).catch(e => e);
    expect(error).toBeInstanceOf(CartIssuesError);
    expect(error.issues).toEqual([{ sku: 'espresso-250', message: 'Espresso 250 g está agotado por ahora.' }]);
    expect(inserted).toHaveLength(1);
    expect(reservations).toHaveLength(1);
  });

  it('informa por producto cuando falta stock y no reserva nada de lo demás', async () => {
    const other = variant({ variantId: 2, sku: 'hotfix-250', productName: 'Hotfix', stock: 0, grinds: ['Grano entero'] });
    const { deps, inserted, reservations } = memoryDeps([variant({ variantId: 1 }), other]);
    const error = await createOrder(deps, [line(1), line(1, 'hotfix-250', 'Grano entero')], customer).catch(e => e);
    expect(error.issues).toEqual([{ sku: 'hotfix-250', message: 'Hotfix 250 g está agotado por ahora.' }]);
    expect(inserted).toEqual([]);
    expect(reservations).toEqual([]);
  });

  it('una reserva vencida se ignora al calcular la disponibilidad, sin depender de ningún cron (reloj simulado)', async () => {
    const { deps, clock } = memoryDeps([variant({ variantId: 9, stock: 1 })]);
    await createOrder(deps, [line(1)], customer);
    clock.advance(29 * MIN);
    await expect(createOrder(deps, [line(1)], customer)).rejects.toBeInstanceOf(CartIssuesError);
    clock.advance(2 * MIN);
    await expect(createOrder(deps, [line(1)], customer)).resolves.toMatchObject({ id: 'o-2' });
  });

  it('modificar el pedido no compite contra su propia reserva y conserva su vencimiento', async () => {
    const { deps, reservations, clock } = memoryDeps([variant({ variantId: 9, stock: 3 })]);
    await createOrder(deps, [line(3)], customer);
    const original = reservations[0].expiresAt;
    clock.advance(10 * MIN);
    await updateOrderItems(deps, 'o-1', [line(2)]);
    expect(reservations).toEqual([{ orderId: 'o-1', variantId: 9, quantity: 2, expiresAt: original }]);
  });

  it('modificar el pedido sí respeta lo reservado por otros', async () => {
    const { deps } = memoryDeps([variant({ variantId: 9, stock: 3 })]);
    await createOrder(deps, [line(1)], customer);
    await createOrder(deps, [line(2)], customer);
    await expect(updateOrderItems(deps, 'o-1', [line(2)])).rejects.toMatchObject({
      issues: [{ sku: 'espresso-250', message: 'Solo queda 1 unidad de Espresso 250 g.' }]
    });
  });

  it('un pedido cuya reserva ya venció recibe una nueva de 30 minutos al modificarlo', async () => {
    const { deps, reservations, clock } = memoryDeps([variant({ variantId: 9, stock: 3 })]);
    await createOrder(deps, [line(1)], customer);
    clock.advance(45 * MIN);
    await updateOrderItems(deps, 'o-1', [line(1)]);
    expect(reservations[0].expiresAt).toEqual(new Date(clock.now().getTime() + 30 * MIN));
  });

  it('recotizar un pedido no cuenta su propia reserva en su contra', async () => {
    const { deps } = memoryDeps([variant({ variantId: 9, stock: 2 })]);
    await createOrder(deps, [line(2)], customer);
    const base = { items: [line(2)], shippingZoneId: 5, shippingRegion: 'Lima' };
    expect((await quoteOrder(deps, base)).issues).toHaveLength(1);
    expect((await quoteOrder(deps, { ...base, id: 'o-1' })).issues).toEqual([]);
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
