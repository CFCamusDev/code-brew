import { describe, expect, it } from 'vitest';
import { confirmPayment } from '../../src/server/modules/payments/application/confirm-payment';
import type { ConfirmPaymentStore, RefundReader, RefundStore } from '../../src/server/modules/payments/application/ports/order-payment-store';
import { refundOrder, type RefundDeps } from '../../src/server/modules/payments/application/refund-order';
import { isGatewayCharge, isRefundableStatus, type ConfirmedPayment } from '../../src/server/modules/payments/domain/payment-rules';
import { FakeGateway } from '../../src/server/modules/payments/infrastructure/fake-gateway';
import { FixedClock } from '../../src/server/shared/clock';

const payment = (overrides: Partial<ConfirmedPayment> = {}): ConfirmedPayment => ({
  reference: 'chr_1', method: 'card', amountCents: 7600, raw: {}, ...overrides
});

/** Tienda en memoria que reproduce la semántica de la real: un pago por referencia (ON CONFLICT) y pedido con estado. */
function memoryConfirmStore(status = 'pending', shortage = false) {
  const state = { status, paidAt: null as Date | null, stockShortage: null as boolean | null, sales: 0 };
  const payments = new Map<string, string>();
  const store: ConfirmPaymentStore = {
    lockOrder: async id => (id === 'o-1' ? { status: state.status } : null),
    findPaymentStatus: async ref => payments.get(ref) ?? null,
    upsertPaidPayment: async (_id, p) => void payments.set(p.reference, 'paid'),
    orderLines: async () => [{ variantId: 1, quantity: 2 }],
    registerSale: async () => (state.sales++, { shortage }),
    markOrderPaid: async (_id, data) => {
      state.status = 'paid';
      state.paidAt = data.paidAt;
      state.stockShortage = data.stockShortage;
    }
  };
  return { store, state, payments };
}

describe('ConfirmarPago', () => {
  const clock = new FixedClock(new Date('2026-03-01T15:00:00Z'));

  it('confirma: registra el pago, descuenta stock y marca el pedido pagado con la hora del reloj', async () => {
    const { store, state, payments } = memoryConfirmStore();
    expect(await confirmPayment({ store, clock }, 'o-1', payment())).toBe('confirmed');
    expect(state).toMatchObject({ status: 'paid', paidAt: new Date('2026-03-01T15:00:00Z'), stockShortage: false, sales: 1 });
    expect(payments.get('chr_1')).toBe('paid');
  });

  it('propaga el faltante de stock al pedido', async () => {
    const { store, state } = memoryConfirmStore('pending', true);
    await confirmPayment({ store, clock }, 'o-1', payment());
    expect(state.stockShortage).toBe(true);
  });

  it('doble confirmación del mismo pago no tiene efecto', async () => {
    const { store, state } = memoryConfirmStore();
    await confirmPayment({ store, clock }, 'o-1', payment());
    expect(await confirmPayment({ store, clock }, 'o-1', payment())).toBe('already_processed');
    expect(state.sales).toBe(1);
  });

  it('un pago distinto sobre un pedido ya pagado se reporta como adicional y no toca stock', async () => {
    const { store, state } = memoryConfirmStore();
    await confirmPayment({ store, clock }, 'o-1', payment());
    expect(await confirmPayment({ store, clock }, 'o-1', payment({ reference: 'ord_9', method: 'order' }))).toBe('additional_payment');
    expect(state.sales).toBe(1);
  });

  it('un pedido cancelado no se reactiva: el pago queda registrado como adicional', async () => {
    const { store, state, payments } = memoryConfirmStore('cancelled');
    expect(await confirmPayment({ store, clock }, 'o-1', payment())).toBe('additional_payment');
    expect(state.status).toBe('cancelled');
    expect(state.sales).toBe(0);
    expect(payments.has('chr_1')).toBe(true);
  });

  it('el webhook puede llegar antes que la respuesta del cargo (o después): el resultado es el mismo', async () => {
    // El pedido de PagoEfectivo/billetera lo confirma el webhook; si la respuesta del cargo llega después, no suma nada.
    const first = memoryConfirmStore();
    expect(await confirmPayment({ store: first.store, clock }, 'o-1', payment({ reference: 'ord_1', method: 'order' }))).toBe('confirmed');
    expect(await confirmPayment({ store: first.store, clock }, 'o-1', payment({ reference: 'ord_1', method: 'order' }))).toBe('already_processed');

    const reversed = memoryConfirmStore();
    await confirmPayment({ store: reversed.store, clock }, 'o-1', payment({ reference: 'ord_1', method: 'order' }));
    await confirmPayment({ store: reversed.store, clock }, 'o-1', payment({ reference: 'ord_1', method: 'order' }));
    expect(reversed.state).toEqual(first.state);
    expect(first.state.sales).toBe(1);
  });

  it('falla si el pedido no existe', async () => {
    const { store } = memoryConfirmStore();
    await expect(confirmPayment({ store, clock }, 'otro', payment())).rejects.toThrow(/no existe/);
  });
});

function refundHarness(order: Awaited<ReturnType<RefundReader['findOrder']>>, lockedStatus: string | null = 'paid') {
  const calls: string[] = [];
  const events: { fromStatus: string; note: string }[] = [];
  const gateway = new FakeGateway();
  const store: RefundStore = {
    lockOrderStatus: async () => lockedStatus,
    markOrderRefunded: async () => void calls.push('order'),
    markPaymentsRefunded: async () => void calls.push('payments'),
    restock: async () => void calls.push('restock'),
    recordRefundEvent: async e => void events.push({ fromStatus: e.fromStatus, note: e.note })
  };
  const deps: RefundDeps = { gateway, reader: { findOrder: async () => order }, transact: work => work(store) };
  return { deps, calls, events, gateway };
}
const paidOrder = { status: 'paid', refundableCharge: { reference: 'chr_1', amountCents: 7600 } };
const options = { reason: 'solicitud_comprador' as const, restockItems: true, manual: false };

describe('Reembolsar', () => {
  it('devuelve por la pasarela y luego marca pedido y pagos, repone stock y deja el evento', async () => {
    const { deps, calls, events, gateway } = refundHarness(paidOrder);
    await refundOrder(deps, 'o-1', 3, { ...options, note: 'cliente pidió' });
    expect(gateway.refunds).toEqual([{ chargeId: 'chr_1', amountCents: 7600, reason: 'solicitud_comprador' }]);
    expect(calls).toEqual(['order', 'payments', 'restock']);
    expect(events).toEqual([{ fromStatus: 'paid', note: 'Reembolso Culqi ref_fake_1 · cliente pidió' }]);
  });

  it('sin reposición no toca el stock', async () => {
    const { deps, calls } = refundHarness(paidOrder);
    await refundOrder(deps, 'o-1', 3, { ...options, restockItems: false });
    expect(calls).toEqual(['order', 'payments']);
  });

  it('manual: no llama a la pasarela y lo registra como reembolso manual', async () => {
    const { deps, events, gateway } = refundHarness({ status: 'preparing', refundableCharge: null });
    await refundOrder(deps, 'o-1', 3, { ...options, manual: true });
    expect(gateway.refunds).toEqual([]);
    expect(events[0].note).toBe('Reembolso manual (CulqiPanel)');
  });

  it('automático sin cargo de pasarela pide hacerlo manual', async () => {
    const { deps, calls } = refundHarness({ status: 'paid', refundableCharge: null });
    await expect(refundOrder(deps, 'o-1', 3, options)).rejects.toThrow(/reembolso manual/);
    expect(calls).toEqual([]);
  });

  it('solo reembolsa pedidos pagados que no se despacharon', async () => {
    const { deps, gateway } = refundHarness({ status: 'shipped', refundableCharge: null });
    await expect(refundOrder(deps, 'o-1', 3, options)).rejects.toThrow(/aún no se despachan/);
    expect(gateway.refunds).toEqual([]);
  });

  it('pedido inexistente', async () => {
    const { deps } = refundHarness(null);
    await expect(refundOrder(deps, 'o-1', 3, options)).rejects.toThrow(/no encontrado/);
  });

  it('si la pasarela rechaza, no cambia nada en la base', async () => {
    const { deps, calls, gateway } = refundHarness(paidOrder);
    await gateway.refund({ chargeId: 'chr_1', amountCents: 7600, reason: 'solicitud_comprador' });
    await expect(refundOrder(deps, 'o-1', 3, options)).rejects.toThrow(/Culqi rechazó el reembolso: El cargo ya fue devuelto\./);
    expect(calls).toEqual([]);
  });
});

describe('reglas de pago', () => {
  it('estados reembolsables y cargos de pasarela', () => {
    expect(['paid', 'preparing'].every(isRefundableStatus)).toBe(true);
    expect(['pending', 'shipped', 'delivered', 'cancelled', 'refunded'].some(isRefundableStatus)).toBe(false);
    expect(isGatewayCharge('chr_abc')).toBe(true);
    expect(isGatewayCharge('ord_abc')).toBe(false);
    expect(isGatewayCharge(null)).toBe(false);
  });
});
