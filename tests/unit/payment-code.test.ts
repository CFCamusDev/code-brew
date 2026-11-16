import { describe, expect, it } from 'vitest';
import { pendingPaymentCode } from '../../src/server/modules/payments/application/pending-payment-code';
import { FakeGateway, type PaymentGateway } from '../../src/server/modules/payments';
import { FixedClock } from '../../src/server/shared';

const now = new Date('2026-11-16T23:00:00Z');
const expiresAt = new Date('2026-11-17T23:00:00Z');

async function setup() {
  const gateway = new FakeGateway();
  const created = await gateway.createOrder({
    amountCents: 5400,
    orderNumber: 'CB-000012-x',
    orderId: 'pedido-1',
    expiresAt,
    client: { fullName: 'Ana Pérez', email: 'ana@example.com', phone: '987654321' }
  });
  if (!created.ok) throw new Error('no se creó la orden');
  const reader = { findPendingOrderReference: async (orderId: string) => (orderId === 'pedido-1' ? created.order.id : null) };
  return { gateway, reader, reference: created.order.id };
}

describe('VerCodigoDePago', () => {
  it('devuelve el CIP, el monto y el vencimiento de la orden pendiente', async () => {
    const { gateway, reader } = await setup();
    expect(await pendingPaymentCode({ gateway, reader, clock: new FixedClock(now) }, 'pedido-1')).toEqual({
      code: '100000001',
      amountCents: 5400,
      expiresAt: expiresAt.toISOString()
    });
  });

  it('sin orden pendiente, ya pagada o vencida no muestra un código que no sirve', async () => {
    const { gateway, reader, reference } = await setup();
    expect(await pendingPaymentCode({ gateway, reader, clock: new FixedClock(now) }, 'otro-pedido')).toBeNull();
    expect(await pendingPaymentCode({ gateway, reader, clock: new FixedClock(new Date('2026-11-18T00:00:00Z')) }, 'pedido-1')).toBeNull();
    gateway.expireOrder(reference);
    expect(await pendingPaymentCode({ gateway, reader, clock: new FixedClock(now) }, 'pedido-1')).toBeNull();
    const paid = await setup();
    paid.gateway.payOrder(paid.reference);
    expect(await pendingPaymentCode({ gateway: paid.gateway, reader: paid.reader, clock: new FixedClock(now) }, 'pedido-1')).toBeNull();
  });

  it('si la orden aún no tiene CIP o la pasarela falla, no rompe la página', async () => {
    const { reader } = await setup();
    const fetchOrder = async () => ({ ok: true as const, order: { id: 'ord_1', amountCents: 5400, state: 'created' as const, paymentCode: null, expiresAt, raw: {} } });
    const noCode: PaymentGateway = Object.assign(new FakeGateway(), { fetchOrder });
    expect(await pendingPaymentCode({ gateway: noCode, reader, clock: new FixedClock(now) }, 'pedido-1')).toBeNull();
    const failing: PaymentGateway = Object.assign(new FakeGateway(), { fetchOrder: async () => Promise.reject(new Error('timeout')) });
    expect(await pendingPaymentCode({ gateway: failing, reader, clock: new FixedClock(now) }, 'pedido-1')).toBeNull();
    const disabled = new FakeGateway({ enabled: false });
    expect(await pendingPaymentCode({ gateway: disabled, reader, clock: new FixedClock(now) }, 'pedido-1')).toBeNull();
  });
});
