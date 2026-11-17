import { afterAll, describe, expect, it } from 'vitest';
import { ADMIN, api, customer, db, login } from './helpers';

// Conciliación de pagos contra la pasarela (S4.5), con PAYMENT_GATEWAY=fake: la pasarela de prueba guarda en memoria
// del servidor lo que cobró, y la prueba altera la base para fabricar las diferencias.
const fake = process.env.PAYMENT_GATEWAY === 'fake';
const sql = db();
afterAll(() => sql.end());

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());

async function paidOrder() {
  const created = await api('/api/orders', { body: { items: [{ sku: 'espresso-250', grind: 'Grano entero', quantity: 1 }], customer, acceptedPolicies: true } });
  const charged = await api('/api/payments/charge', { body: { orderId: created.json.id, tokenId: 'tkn_fake_ok', email: customer.email } });
  expect(charged.json.status).toBe('paid');
  const [payment] = await sql`select provider_reference from payments where order_id = ${created.json.id} and status = 'paid'`;
  return { orderId: created.json.id as string, reference: payment.provider_reference as string };
}

/** Fila del CSV (sin BOM) cuya referencia es `reference`. */
const rowFor = (csv: string, reference: string) => csv.split('\r\n').find(line => line.includes(`,${reference},`));

describe.runIf(fake)('GET /api/admin/export/conciliacion', () => {
  it('identifica un pago faltante y uno registrado sin cobro; lo que coincide queda al final', async () => {
    const matching = await paidOrder();

    // Pago faltante: la pasarela cobró, pero en la tienda quedó pendiente (p. ej. se perdió la confirmación).
    const missing = await paidOrder();
    await sql`update payments set status = 'pending' where provider_reference = ${missing.reference}`;
    await sql`update orders set status = 'pending', paid_at = null where id = ${missing.orderId}`;

    // Registrado sin cobro: la tienda lo tiene pagado con una referencia que la pasarela no conoce.
    const created = await api('/api/orders', { body: { items: [{ sku: 'espresso-250', grind: 'Grano entero', quantity: 1 }], customer, acceptedPolicies: true } });
    await sql`
      insert into payments (order_id, provider_reference, method, status, amount_cents)
      values (${created.json.id}, ${`chr_qa_sin_cobro_${Date.now()}`}, 'card', 'paid', 4900)`;
    const [{ provider_reference: phantom }] = await sql`select provider_reference from payments where order_id = ${created.json.id}`;

    const cookie = await login(ADMIN);
    const response = await api(`/api/admin/export/conciliacion?desde=${today}&hasta=${today}`, { cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('codebrew-conciliacion-');
    const csv = response.text;
    expect(csv.split('\r\n')[0]).toContain('Resultado,Referencia,Tipo,Pedido');
    expect(rowFor(csv, missing.reference)).toMatch(/^Cobrado en Culqi sin registrar en la tienda,/);
    expect(rowFor(csv, missing.reference)).toContain(',Pendiente,');
    expect(rowFor(csv, phantom)).toMatch(/^Registrado como pagado sin cobro en Culqi,/);
    expect(rowFor(csv, matching.reference)).toMatch(/^Coincide,/);

    // Las diferencias aparecen antes que las filas que coinciden.
    const lines = csv.split('\r\n');
    expect(lines.findIndex(line => line.includes(missing.reference))).toBeLessThan(lines.findIndex(line => line.includes(matching.reference)));
  });

  it('valida el rango de fechas y exige sesión del panel', async () => {
    const cookie = await login(ADMIN);
    expect((await api('/api/admin/export/conciliacion?desde=2026-01-01&hasta=2026-12-31', { cookie })).status).toBe(400);
    expect((await api('/api/admin/export/conciliacion?desde=2026-11-17&hasta=2026-11-01', { cookie })).status).toBe(400);
    expect((await api(`/api/admin/export/conciliacion?desde=${today}`)).status).not.toBe(200);
  });
});
