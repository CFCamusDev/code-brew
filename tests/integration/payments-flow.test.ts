import { afterAll, describe, expect, it } from 'vitest';
import { api, customer, db } from './helpers';

// Flujo de pago de punta a punta por HTTP con FakeGateway (S4.2). El servidor y las pruebas corren con
// PAYMENT_GATEWAY=fake (CI): el token elige el resultado del cargo, sin red ni dinero real.
const fake = process.env.PAYMENT_GATEWAY === 'fake';
const TOKENS = { ok: 'tkn_fake_ok', declined: 'tkn_fake_declined', threeDS: 'tkn_fake_3ds', error: 'tkn_fake_error' };
const item = { sku: 'espresso-500', grind: 'Grano entero', quantity: 1 };
const sql = db();

afterAll(() => sql.end());

async function newOrder() {
  const created = await api('/api/orders', { body: { items: [item], customer, acceptedPolicies: true } });
  expect(created.status).toBe(201);
  return created.json.id as string;
}

const stock = async () => (await sql`select stock from product_variants where sku = ${item.sku}`)[0].stock as number;
const order = async (id: string) => (await sql`select status, stock_shortage from orders where id = ${id}`)[0];
const charge = (orderId: string, tokenId: string, extra: Record<string, unknown> = {}) =>
  api('/api/payments/charge', { body: { orderId, tokenId, email: customer.email, ...extra } });

describe.runIf(fake)('pagos con la pasarela de prueba', () => {
  it('tarjeta o Yape aprobados: confirma el pedido y descuenta el stock una sola vez', async () => {
    const orderId = await newOrder();
    const before = await stock();

    const paid = await charge(orderId, TOKENS.ok);
    expect(paid.status).toBe(200);
    expect(paid.json.status).toBe('paid');
    expect(await order(orderId)).toMatchObject({ status: 'paid', stock_shortage: false });
    expect(await stock()).toBe(before - 1);

    // Reintento del navegador o doble clic: no cobra ni descuenta otra vez.
    const again = await charge(orderId, TOKENS.ok);
    expect(again.json.status).toBe('paid');
    expect(await stock()).toBe(before - 1);
    const payments = await sql`select status from payments where order_id = ${orderId}`;
    expect(payments.map(row => row.status)).toEqual(['paid']);
    const movements = await sql`select delta, reason from stock_movements where order_id = ${orderId}`;
    expect(movements).toEqual([{ delta: -1, reason: 'sale' }]);
  });

  it('rechazo del banco: el pedido sigue pendiente, sin stock descontado y con el intento registrado', async () => {
    const orderId = await newOrder();
    const before = await stock();
    const declined = await charge(orderId, TOKENS.declined);
    expect(declined.status).toBe(402);
    expect(declined.json).toMatchObject({ status: 'declined', message: 'Tu banco rechazó el pago.' });
    expect((await order(orderId)).status).toBe('pending');
    expect(await stock()).toBe(before);
    expect((await sql`select status from payments where order_id = ${orderId}`).map(row => row.status)).toEqual(['failed']);

    // El cliente reintenta con otra tarjeta y se confirma.
    expect((await charge(orderId, TOKENS.ok)).json.status).toBe('paid');
    expect(await stock()).toBe(before - 1);
  });

  it('3DS: primero pide autenticación y, con los datos del banco, confirma', async () => {
    const orderId = await newOrder();
    const first = await charge(orderId, TOKENS.threeDS);
    expect(first.json.status).toBe('3ds_required');
    expect((await order(orderId)).status).toBe('pending');
    const second = await charge(orderId, TOKENS.threeDS, { authentication3DS: { eci: '05', xid: 'x', cavv: 'c' } });
    expect(second.json.status).toBe('paid');
    expect((await order(orderId)).status).toBe('paid');
  });

  it('error de la pasarela: mensaje para reintentar y nada confirmado', async () => {
    const orderId = await newOrder();
    const failed = await charge(orderId, TOKENS.error);
    expect(failed.status).toBe(502);
    expect(failed.json.status).toBe('error');
    expect((await order(orderId)).status).toBe('pending');
  });

  it('PagoEfectivo, agentes y billeteras: la sesión crea la orden y el webhook la consulta sin confirmar mientras siga pendiente', async () => {
    const orderId = await newOrder();
    const session = await api('/api/payments/session', { body: { orderId } });
    expect(session.status).toBe(200);
    expect(session.json).toMatchObject({ status: 'ready', publicKey: 'pk_fake' });
    expect(session.json.culqiOrderId).toMatch(/^ord_fake_\d+$/);

    // Abrir de nuevo el pago reutiliza la misma orden en lugar de crear otra.
    expect((await api('/api/payments/session', { body: { orderId } })).json.culqiOrderId).toBe(session.json.culqiOrderId);

    const secret = process.env.CULQI_WEBHOOK_SECRET;
    if (secret) {
      const event = { type: 'order.status.changed', data: JSON.stringify({ id: session.json.culqiOrderId }) };
      const notified = await api(`/api/webhooks/culqi?key=${secret}`, { body: event });
      expect(notified.json).toEqual({ received: true, result: 'unchanged' });
    }
    expect((await order(orderId)).status).toBe('pending');
  });

  it('un pedido ya pagado no admite otro cobro', async () => {
    const orderId = await newOrder();
    await charge(orderId, TOKENS.ok);
    const session = await api('/api/payments/session', { body: { orderId } });
    expect(session.json.status).toBe('paid');
  });
});
