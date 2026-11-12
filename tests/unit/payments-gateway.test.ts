import { describe, expect, it, vi } from 'vitest';
import type { ChargeRequest, PaymentOrderRequest } from '../../src/server/modules/payments';
import { FakeGateway } from '../../src/server/modules/payments';
import { CulqiGateway, isCulqiError, splitName } from '../../src/server/modules/payments/infrastructure/culqi-gateway';

const T = FakeGateway.TOKENS;

const chargeRequest = (tokenId: string, extra: Partial<ChargeRequest> = {}): ChargeRequest => ({
  amountCents: 4900,
  email: 'ana@example.com',
  tokenId,
  orderNumber: 'CB-000001',
  orderId: '11111111-1111-4111-8111-111111111111',
  customer: { fullName: 'Ana María Pérez López', phone: '987654321', address: 'Av. Larco 123', city: 'Lima' },
  ...extra
});

const orderRequest = (): PaymentOrderRequest => ({
  amountCents: 4900,
  orderNumber: 'CB-000001-abc',
  orderId: '11111111-1111-4111-8111-111111111111',
  expiresAt: new Date('2026-11-12T12:00:00Z'),
  client: { fullName: 'Ana Pérez', email: 'ana@example.com', phone: '987654321' }
});

describe('splitName', () => {
  it('separa nombres y apellidos como pide Culqi', () => {
    expect(splitName('Ana Pérez')).toEqual({ firstName: 'Ana', lastName: 'Pérez' });
    expect(splitName('Juan Carlos Pérez López')).toEqual({ firstName: 'Juan Carlos', lastName: 'Pérez López' });
    expect(splitName('  Cher ')).toEqual({ firstName: 'Cher', lastName: 'Cher' });
  });
});

describe('isCulqiError', () => {
  it('reconoce los errores de la API', () => {
    expect(isCulqiError({ object: 'error', type: 'card_error' })).toBe(true);
    expect(isCulqiError({ object: 'charge', id: 'chr_1' })).toBe(false);
    expect(isCulqiError(null)).toBe(false);
  });
});

describe('FakeGateway: cargos', () => {
  it('cargo exitoso', async () => {
    const gateway = new FakeGateway();
    const outcome = await gateway.charge(chargeRequest(T.OK));
    expect(outcome).toMatchObject({ kind: 'paid', chargeId: 'chr_fake_1', amountCents: 4900, method: 'card' });
    expect(gateway.charges).toHaveLength(1);
  });

  it('rechazo del banco, con el cargo fallido para registrar', async () => {
    const outcome = await new FakeGateway().charge(chargeRequest(T.DECLINED));
    expect(outcome).toMatchObject({ kind: 'declined', userMessage: 'Tu banco rechazó el pago.', chargeId: 'chr_fake_1' });
  });

  it('3DS: primero pide autenticación y al reintentar con los parámetros cobra', async () => {
    const gateway = new FakeGateway();
    expect(await gateway.charge(chargeRequest(T.REQUIRES_3DS))).toEqual({ kind: 'requires_3ds' });
    const retry = await gateway.charge(chargeRequest(T.REQUIRES_3DS, { authentication3DS: { eci: '05', xid: 'abc' } }));
    expect(retry.kind).toBe('paid');
    expect(gateway.charges).toHaveLength(2);
  });

  it('error de la pasarela que no es rechazo del banco', async () => {
    expect(await new FakeGateway().charge(chargeRequest(T.ERROR))).toMatchObject({ kind: 'failed' });
  });

  it('respuesta fuera de contrato', async () => {
    expect(await new FakeGateway().charge(chargeRequest(T.UNEXPECTED))).toMatchObject({ kind: 'unexpected', status: 500 });
  });

  it('es determinista: los mismos pasos dan los mismos ids', async () => {
    const run = async () => {
      const gateway = new FakeGateway();
      return [await gateway.charge(chargeRequest(T.OK)), await gateway.charge(chargeRequest(T.OK))];
    };
    expect(await run()).toEqual(await run());
  });

  it('se puede desactivar y expone su llave pública', () => {
    expect(new FakeGateway({ enabled: false }).isEnabled()).toBe(false);
    expect(new FakeGateway().isEnabled()).toBe(true);
    expect(new FakeGateway({ publicKey: 'pk_x' }).publicKey()).toBe('pk_x');
  });
});

describe('FakeGateway: órdenes y reembolsos', () => {
  it('una orden queda pendiente hasta que el cliente paga o vence', async () => {
    const gateway = new FakeGateway();
    const created = await gateway.createOrder(orderRequest());
    expect(created).toMatchObject({ ok: true, order: { id: 'ord_fake_1', amountCents: 4900, state: 'pending' } });

    gateway.payOrder('ord_fake_1');
    expect(await gateway.fetchOrder('ord_fake_1')).toMatchObject({ ok: true, order: { state: 'paid' } });

    await gateway.createOrder(orderRequest());
    gateway.expireOrder('ord_fake_2');
    expect(await gateway.fetchOrder('ord_fake_2')).toMatchObject({ ok: true, order: { state: 'expired' } });
  });

  it('consultar una orden desconocida falla con 404', async () => {
    expect(await new FakeGateway().fetchOrder('ord_nope')).toMatchObject({ ok: false, status: 404 });
  });

  it('un cargo no se devuelve dos veces', async () => {
    const gateway = new FakeGateway();
    const request = { chargeId: 'chr_fake_1', amountCents: 4900, reason: 'solicitud_comprador' as const };
    expect(await gateway.refund(request)).toEqual({ ok: true, refundId: 'ref_fake_1' });
    expect(await gateway.refund(request)).toMatchObject({ ok: false, status: 400, message: 'El cargo ya fue devuelto.' });
  });
});

describe('CulqiGateway (adaptador)', () => {
  const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  const gatewayWith = (fetch: ReturnType<typeof respond>) => new CulqiGateway({ publicKey: 'pk_test_1', secretKey: 'sk_test_1', fetch });
  const sentInit = (fetch: ReturnType<typeof respond>) => (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
  const sentBody = (fetch: ReturnType<typeof respond>) => JSON.parse(sentInit(fetch).body as string);

  it('solo está activo con las dos llaves', () => {
    expect(new CulqiGateway({ publicKey: 'pk', secretKey: 'sk' }).isEnabled()).toBe(true);
    expect(new CulqiGateway({ publicKey: 'pk' }).isEnabled()).toBe(false);
    expect(new CulqiGateway({}).isEnabled()).toBe(false);
    expect(new CulqiGateway({ publicKey: 'pk_test_1' }).publicKey()).toBe('pk_test_1');
  });

  it('sin llave secreta no llama a la red', async () => {
    const fetch = respond(201, {});
    await expect(new CulqiGateway({ fetch }).charge(chargeRequest('tkn'))).rejects.toThrow('falta CULQI_SECRET_KEY');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cargo pagado (201): envía nombre/apellido, antifraude y la llave secreta', async () => {
    const fetch = respond(201, { object: 'charge', id: 'chr_live_1', amount: 4900, source: { type: 'card' } });
    const outcome = await gatewayWith(fetch).charge(chargeRequest('tkn_1', { deviceId: 'dev_1' }));
    expect(outcome).toMatchObject({ kind: 'paid', chargeId: 'chr_live_1', amountCents: 4900, method: 'card' });

    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe('https://api.culqi.com/v2/charges');
    expect((sentInit(fetch).headers as Record<string, string>).Authorization).toBe('Bearer sk_test_1');
    const body = sentBody(fetch);
    expect(body).toMatchObject({
      amount: 4900,
      currency_code: 'PEN',
      source_id: 'tkn_1',
      capture: true,
      antifraud_details: { first_name: 'Ana María', last_name: 'Pérez López', device_finger_print_id: 'dev_1', country_code: 'PE' },
      metadata: { order_number: 'CB-000001' }
    });
    expect(body.authentication_3DS).toBeUndefined();
  });

  it('el método de pago sale del origen del cargo (Yape)', async () => {
    const fetch = respond(201, { object: 'charge', id: 'chr_2', amount: 4900, source: { type: 'yape' } });
    expect(await gatewayWith(fetch).charge(chargeRequest('tkn_y'))).toMatchObject({ kind: 'paid', method: 'yape' });
  });

  it('200 con action_code REVIEW pide 3DS, y reenvía authentication_3DS al reintentar', async () => {
    const review = respond(200, { object: 'charge', action_code: 'REVIEW' });
    expect(await gatewayWith(review).charge(chargeRequest('tkn_1'))).toEqual({ kind: 'requires_3ds' });

    const paid = respond(201, { object: 'charge', id: 'chr_3', amount: 4900 });
    await gatewayWith(paid).charge(chargeRequest('tkn_1', { authentication3DS: { eci: '05' } }));
    expect(sentBody(paid).authentication_3DS).toEqual({ eci: '05' });
  });

  it.each([
    ['card_error (documentación, 402)', 402, { object: 'error', type: 'card_error', user_message: 'Fondos insuficientes' }],
    ['operacion_denegada (sandbox, 400)', 400, { object: 'error', type: 'operacion_denegada', decline_code: 'insufficient_funds' }],
    ['cualquier tipo con decline_code', 400, { object: 'error', type: 'otro', decline_code: 'lost_card' }]
  ])('rechazo: %s', async (_name, status, error) => {
    const outcome = await gatewayWith(respond(status, { ...error, charge_id: 'chr_x' })).charge(chargeRequest('tkn_1'));
    expect(outcome).toMatchObject({ kind: 'declined', chargeId: 'chr_x' });
  });

  it('un error de la pasarela sin decline_code no es un rechazo del banco', async () => {
    const outcome = await gatewayWith(respond(500, { object: 'error', type: 'api_error', user_message: 'Reintenta' })).charge(chargeRequest('tkn_1'));
    expect(outcome).toMatchObject({ kind: 'failed', userMessage: 'Reintenta' });
  });

  it('una respuesta fuera de contrato es inesperada y conserva el estado HTTP', async () => {
    expect(await gatewayWith(respond(200, { object: 'charge' })).charge(chargeRequest('tkn_1'))).toMatchObject({ kind: 'unexpected', status: 200 });
    const html = vi.fn(async () => new Response('<html>', { status: 502 }));
    expect(await gatewayWith(html).charge(chargeRequest('tkn_1'))).toMatchObject({ kind: 'unexpected', status: 502 });
  });

  it('crea la orden de pago con teléfono +51 y vencimiento en segundos', async () => {
    const fetch = respond(201, { object: 'order', id: 'ord_1', amount: 4900, state: 'pending', order_number: 'x', expiration_date: 1 });
    const result = await gatewayWith(fetch).createOrder(orderRequest());
    expect(result).toMatchObject({ ok: true, order: { id: 'ord_1', amountCents: 4900, state: 'pending' } });
    expect(sentBody(fetch)).toMatchObject({
      order_number: 'CB-000001-abc',
      expiration_date: Math.floor(new Date('2026-11-12T12:00:00Z').getTime() / 1000),
      client_details: { first_name: 'Ana', last_name: 'Pérez', phone_number: '+51987654321' },
      confirm: false
    });
  });

  it('falla al crear la orden: devuelve estado y respuesta', async () => {
    const result = await gatewayWith(respond(400, { object: 'error', type: 'parameter_error' })).createOrder(orderRequest());
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('consulta una orden y normaliza su estado', async () => {
    const paid = respond(200, { object: 'order', id: 'ord_1', amount: 4900, state: 'paid' });
    expect(await gatewayWith(paid).fetchOrder('ord_1')).toMatchObject({ ok: true, order: { state: 'paid', amountCents: 4900 } });
    expect((paid.mock.calls[0] as unknown as [string])[0]).toBe('https://api.culqi.com/v2/orders/ord_1');

    const odd = respond(200, { object: 'order', id: 'ord_2', amount: 1, state: 'raro' });
    expect(await gatewayWith(odd).fetchOrder('ord_2')).toMatchObject({ ok: true, order: { state: 'unknown' } });
    expect(await gatewayWith(respond(404, { object: 'error', type: 'not_found' })).fetchOrder('ord_3')).toMatchObject({ ok: false, status: 404 });
  });

  it('reembolso exitoso y fallido con el mensaje del comercio', async () => {
    const ok = respond(201, { object: 'refund', id: 'ref_1' });
    expect(await gatewayWith(ok).refund({ chargeId: 'chr_1', amountCents: 4900, reason: 'duplicado' })).toEqual({ ok: true, refundId: 'ref_1' });
    expect(sentBody(ok)).toEqual({ amount: 4900, charge_id: 'chr_1', reason: 'duplicado' });

    const failed = respond(400, { object: 'error', type: 'invalid_request', merchant_message: 'Ya devuelto' });
    expect(await gatewayWith(failed).refund({ chargeId: 'chr_1', amountCents: 4900, reason: 'duplicado' })).toMatchObject({
      ok: false,
      status: 400,
      message: 'Ya devuelto'
    });
  });
});
