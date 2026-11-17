import { describe, expect, it, vi } from 'vitest';
import { reconcilePayments } from '../../src/server/modules/payments/application/reconcile-payments';
import { reconcile, type GatewayTransaction, type LocalPayment } from '../../src/server/modules/payments/domain/reconciliation';
import { FakeGateway } from '../../src/server/modules/payments';
import { CulqiGateway } from '../../src/server/modules/payments/infrastructure/culqi-gateway';

const day = new Date('2026-11-17T15:00:00Z');
const local = (reference: string, status: string, amountCents = 4900, orderNumber = 1): LocalPayment => ({
  reference, orderId: `pedido-${orderNumber}`, orderNumber, status, amountCents, createdAt: day
});
const remote = (reference: string, state: GatewayTransaction['state'], amountCents = 4900): GatewayTransaction => ({
  reference, kind: reference.startsWith('ord_') ? 'order' : 'charge', amountCents, state, orderId: 'pedido-x', createdAt: day
});
const resultOf = (rows: ReturnType<typeof reconcile>, reference: string) => rows.find(row => row.reference === reference)?.result;

describe('conciliación (dominio)', () => {
  it('marca cada diferencia y deja fuera lo que no movió dinero en ningún lado', () => {
    const rows = reconcile(
      [local('chr_ok', 'paid'), local('chr_monto', 'paid', 4900), local('chr_tienda', 'paid'), local('chr_dev', 'refunded'), local('ord_pend', 'pending'), local('chr_falta', 'pending')],
      [remote('chr_ok', 'paid'), remote('chr_monto', 'paid', 4800), remote('chr_dev', 'paid'), remote('ord_pend', 'pending'), remote('chr_falta', 'paid'), remote('chr_solo_culqi', 'paid'), remote('ord_vencida', 'expired')]
    );
    expect(resultOf(rows, 'chr_ok')).toBe('ok');
    expect(resultOf(rows, 'chr_monto')).toBe('monto_distinto');
    expect(resultOf(rows, 'chr_tienda')).toBe('registrado_sin_cobro');
    expect(resultOf(rows, 'chr_dev')).toBe('devolucion_distinta');
    expect(resultOf(rows, 'chr_falta')).toBe('cobrado_sin_registrar');
    expect(resultOf(rows, 'chr_solo_culqi')).toBe('cobrado_sin_registrar');
    expect(resultOf(rows, 'ord_pend')).toBeUndefined();
    expect(resultOf(rows, 'ord_vencida')).toBeUndefined();
  });

  it('las diferencias van primero y conserva los datos de ambos lados', () => {
    const rows = reconcile([local('chr_ok', 'paid', 4900, 7)], [remote('chr_ok', 'paid'), remote('chr_solo_culqi', 'paid', 5400)]);
    expect(rows.map(row => row.result)).toEqual(['cobrado_sin_registrar', 'ok']);
    expect(rows[0]).toMatchObject({ orderNumber: null, localStatus: null, gatewayAmountCents: 5400, kind: 'charge' });
    expect(rows[1]).toMatchObject({ orderNumber: 7, localAmountCents: 4900, gatewayState: 'paid' });
  });
});

describe('Conciliar con FakeGateway', () => {
  it('detecta un pago que la pasarela cobró y la tienda no registró', async () => {
    const gateway = new FakeGateway();
    const paid = await gateway.charge({
      amountCents: 4900, email: 'a@b.pe', tokenId: FakeGateway.TOKENS.OK, orderNumber: 'CB-1', orderId: 'pedido-1',
      customer: { fullName: 'Ana Pérez', phone: '987654321', address: 'Av. 1', city: 'Lima' }
    });
    if (paid.kind !== 'paid') throw new Error('no cobró');
    const range = { from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 60_000) };
    const rows = await reconcilePayments({ gateway, reader: { listPayments: async () => [] } }, range);
    expect(rows).toEqual([expect.objectContaining({ reference: paid.chargeId, result: 'cobrado_sin_registrar', orderId: 'pedido-1' })]);
  });
});

describe('Culqi: listado para conciliar', () => {
  const page = (items: object[], after?: string) =>
    new Response(JSON.stringify({ data: items, paging: { cursors: after ? { after } : {} } }), { status: 200 });

  it('recorre las páginas con el cursor y traduce cargos y órdenes', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `chr_${i}`, amount: 100, paid: true, creation_date: 1794873844 }));
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/charges') && !url.includes('after=')) return page(full, 'chr_99');
      if (url.includes('/charges')) return page([{ id: 'chr_dev', amount: 5000, amount_refunded: 5000, creation_date: 1794873844, metadata: { order_id: 'p-1' } }]);
      return page([{ id: 'ord_1', amount: 5400, state: 'paid', creation_date: 1794873844, metadata: { order_id: 'p-2' } }]);
    });
    const gateway = new CulqiGateway({ publicKey: 'pk_test_x', secretKey: 'sk_test_x', fetch: fetch as unknown as typeof globalThis.fetch });
    const list = await gateway.listTransactions({ from: new Date('2026-11-01T05:00:00Z'), to: new Date('2026-11-18T04:59:59Z') });
    expect(list).toHaveLength(102);
    expect(list.find(item => item.reference === 'chr_dev')).toMatchObject({ state: 'refunded', orderId: 'p-1', kind: 'charge' });
    expect(list.find(item => item.reference === 'ord_1')).toMatchObject({ state: 'paid', orderId: 'p-2', kind: 'order', amountCents: 5400 });
    const charges = fetch.mock.calls.map(([url]) => url).filter(url => url.includes('/charges'));
    expect(charges[0]).toContain('creation_date_from=1793509200&creation_date_to=1794977999');
    expect(charges[1]).toContain('after=chr_99');
  });

  it('si Culqi falla, lanza en lugar de entregar un reporte incompleto', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ object: 'error', type: 'api_error' }), { status: 500 }));
    const gateway = new CulqiGateway({ publicKey: 'pk_test_x', secretKey: 'sk_test_x', fetch: fetch as unknown as typeof globalThis.fetch });
    await expect(gateway.listTransactions({ from: day, to: day })).rejects.toThrow('Culqi no pudo listar');
  });
});
