import { describe, expect, it } from 'vitest';
import { cartIssuesErrorSchema, quoteRequestSchema, quoteResponseSchema } from '../../src/contracts/cart';
import { createOrderResponseSchema } from '../../src/contracts/checkout';
import { updateOrderItemsRequestSchema, updateOrderItemsResponseSchema } from '../../src/contracts/orders';
import { quoteCart, type ShippingRules } from '../../src/server/modules/ordering/domain/cart-quote';

// La cotización del dominio debe cumplir el contrato que leen el carrito y el checkout: si el servidor agrega,
// quita o renombra un campo, esta prueba falla además del typecheck de los endpoints.
const shipping: ShippingRules = {
  zones: [{ slug: 'lima', name: 'Lima', eta: '24 h', priceCents: 1500, freeFromCents: null, freeFromBags: 3, regions: ['Lima'], hasRegionRates: false }],
  calculate: ({ zoneSlug }) => (zoneSlug === 'lima' ? { status: 'ok', shippingCents: 1500 } : { status: 'no_zone' })
};
const hotfix = {
  variantId: 1,
  sku: 'hotfix-250',
  format: '250 g',
  priceCents: 4500,
  stock: 1,
  reserved: 0,
  bags: 1,
  variantActive: true,
  productName: 'Hotfix',
  grinds: ['Grano entero'],
  productActive: true
};

describe('contratos de la API', () => {
  it('la cotización del dominio cumple el contrato de respuesta, con y sin problemas', () => {
    const ok = quoteCart([{ sku: 'hotfix-250', grind: 'Grano entero', quantity: 1 }], [hotfix], shipping, { zoneSlug: 'lima' });
    expect(quoteResponseSchema.parse(ok)).toEqual(ok);
    const withIssues = quoteCart([{ sku: 'hotfix-250', grind: 'Grano entero', quantity: 2 }], [hotfix], shipping, {});
    expect(withIssues.issues).toHaveLength(1);
    expect(quoteResponseSchema.parse(withIssues)).toEqual(withIssues);
  });

  it('la entrada de la cotización acepta un carrito vacío y rechaza cantidades inválidas', () => {
    expect(quoteRequestSchema.safeParse({ items: [] }).success).toBe(true);
    expect(quoteRequestSchema.safeParse({ items: [{ sku: 'hotfix-250', grind: 'Grano entero', quantity: 0 }] }).success).toBe(false);
  });

  it('ajustar un pedido exige al menos una línea y responde líneas y totales', () => {
    expect(updateOrderItemsRequestSchema.safeParse({ items: [] }).success).toBe(false);
    expect(updateOrderItemsRequestSchema.safeParse({}).success).toBe(false);
    const ok = quoteCart([{ sku: 'hotfix-250', grind: 'Grano entero', quantity: 1 }], [hotfix], shipping, { zoneSlug: 'lima' });
    const response = { items: ok.lines, subtotalCents: ok.subtotalCents, shippingCents: ok.shippingCents!, totalCents: ok.totalCents! };
    expect(updateOrderItemsResponseSchema.parse(response)).toEqual(response);
  });

  it('las respuestas de creación y de conflicto tienen la forma que lee el checkout', () => {
    expect(createOrderResponseSchema.safeParse({ id: '2f1c1f8e-6f3a-4c55-9b0e-0d8c4b7e2a11', number: 12 }).success).toBe(true);
    expect(createOrderResponseSchema.safeParse({ id: 'no-es-uuid', number: 12 }).success).toBe(false);
    expect(cartIssuesErrorSchema.safeParse({ error: 'Revisa tu pedido.', issues: [{ sku: 'hotfix-250', message: 'Agotado' }] }).success).toBe(true);
  });
});
