import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, api, customer, db, login, OPERATOR } from './helpers';

let adminCookie: string;
let operatorCookie: string;

beforeAll(async () => {
  adminCookie = await login(ADMIN);
  operatorCookie = await login(OPERATOR);
});

async function variantId(sku: string) {
  const sql = db();
  try {
    const [row] = await sql`select id from product_variants where sku = ${sku}`;
    return row.id as number;
  } finally {
    await sql.end();
  }
}

/** Crea un pedido y lo marca pagado directo en la BD (el cobro real lo cubre Culqi). */
async function paidOrder() {
  const created = await api('/api/orders', { body: { items: [{ sku: 'espresso-250', grind: 'Grano entero', quantity: 1 }], customer } });
  const sql = db();
  try {
    await sql`update orders set status = 'paid', paid_at = now() where id = ${created.json.id}`;
  } finally {
    await sql.end();
  }
  return created.json.id as string;
}

describe('acceso al panel', () => {
  it('sin sesión redirige al login y la API responde 401', async () => {
    const page = await api('/admin/pedidos');
    expect(page.status).toBe(302);
    expect(page.headers.get('location')).toContain('/admin/login?next=');
    expect((await api(`/api/admin/orders/${randomUUID()}`, { body: {} })).status).toBe(401);
  });

  it('la cookie de sesión es HttpOnly y SameSite=Lax', async () => {
    const response = await api('/api/admin/login', { body: ADMIN });
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(response.headers.get('set-cookie')).toMatch(/SameSite=Lax/i);
  });

  it('bloquea tras 5 intentos fallidos', async () => {
    const headers = { 'CF-Connecting-IP': `10.9.${Math.floor(Math.random() * 250)}.1` };
    const attempt = () => api('/api/admin/login', { body: { email: `nadie-${randomUUID()}@codebrew.test`, password: 'x' }, headers });
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });

  it('las páginas del panel no se guardan en caché ni se indexan', async () => {
    const page = await api('/admin/pedidos', { cookie: adminCookie });
    expect(page.status).toBe(200);
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(page.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('no permite redirigir a otros sitios después del login', async () => {
    const page = await api('/admin/login?next=//evil.example', { cookie: adminCookie });
    expect(page.headers.get('location')).toBe('/admin/pedidos');
  });

  it('el operador no entra a usuarios', async () => {
    expect((await api('/admin/usuarios', { cookie: operatorCookie })).headers.get('location')).toBe('/admin/pedidos');
  });
});

describe('pedidos en el panel', () => {
  it('sigue el flujo pagado → preparación → enviado → entregado y rechaza saltos', async () => {
    const id = await paidOrder();
    const act = (cookie: string, body: unknown) => api(`/api/admin/orders/${id}`, { body, cookie });
    expect((await act(adminCookie, { action: 'status', to: 'delivered' })).status).toBe(409);
    expect((await act(adminCookie, { action: 'status', to: 'preparing' })).status).toBe(200);
    expect((await act(operatorCookie, { action: 'status', to: 'shipped', carrier: 'Olva', trackingNumber: 'OLV-1' })).status).toBe(200);
    expect((await act(adminCookie, { action: 'status', to: 'delivered' })).status).toBe(200);
    expect((await act(adminCookie, { action: 'refund', reason: 'solicitud_comprador', restock: true, manual: true })).status).toBe(409);
  });

  it('solo un administrador reembolsa y la devolución repone stock', async () => {
    const id = await paidOrder();
    const body = { action: 'refund', reason: 'solicitud_comprador', restock: true, manual: true };
    expect((await api(`/api/admin/orders/${id}`, { body, cookie: operatorCookie })).status).toBe(403);

    const sql = db();
    try {
      const [before] = await sql`select stock from product_variants where sku = 'espresso-250'`;
      expect((await api(`/api/admin/orders/${id}`, { body, cookie: adminCookie })).status).toBe(200);
      const [after] = await sql`select stock from product_variants where sku = 'espresso-250'`;
      const [order] = await sql`select status from orders where id = ${id}`;
      expect(after.stock).toBe(before.stock + 1);
      expect(order.status).toBe('refunded');
    } finally {
      await sql.end();
    }
  });

  it('las acciones solo aceptan JSON', async () => {
    const response = await fetch(`${process.env.INTEGRATION_BASE_URL ?? 'http://127.0.0.1:4321'}/api/admin/orders/${randomUUID()}`, {
      method: 'POST',
      headers: { Cookie: adminCookie, 'Content-Type': 'text/plain' },
      body: 'x'
    });
    expect([403, 415]).toContain(response.status);
  });
});

describe('productos y stock', () => {
  it('el operador no cambia precios, el administrador sí y se ve en la landing', async () => {
    const id = await variantId('monteverde-250');
    const update = { action: 'update', format: '250 g', priceCents: 3700, bags: 1, active: true };
    expect((await api(`/api/admin/products/variants/${id}`, { body: update, cookie: operatorCookie })).status).toBe(403);
    expect((await api(`/api/admin/products/variants/${id}`, { body: update, cookie: adminCookie })).status).toBe(200);
    expect((await api('/')).text).toContain('S/ 37.00');
    await api(`/api/admin/products/variants/${id}`, { body: { ...update, priceCents: 3400 }, cookie: adminCookie });
  });

  it('ajusta stock con historial y nunca lo deja en negativo', async () => {
    const id = await variantId('microlote-temporada');
    const setup = db();
    await setup`update product_variants set stock = 1 where id = ${id}`;
    await setup.end();
    expect((await api(`/api/admin/products/variants/${id}`, { body: { action: 'stock', delta: -5, reason: 'adjustment' }, cookie: operatorCookie })).status).toBe(409);
    const added = await api(`/api/admin/products/variants/${id}`, {
      body: { action: 'stock', delta: 4, reason: 'purchase', note: 'Lote CI' },
      cookie: operatorCookie
    });
    expect(added.json.stock).toBe(5);
    const sql = db();
    try {
      const [movement] = await sql`select delta, reason, note from stock_movements where variant_id = ${id} order by id desc limit 1`;
      expect(movement).toMatchObject({ delta: 4, reason: 'purchase', note: 'Lote CI' });
    } finally {
      await sql.end();
    }
  });
});

describe('envíos, compras y usuarios', () => {
  it('tarifas por departamento: solo administradores y se aplican al cotizar', async () => {
    const sql = db();
    const [zone] = await sql`select id from shipping_zones where slug = 'provincias'`;
    await sql.end();
    const body = { action: 'rate', zoneId: zone.id, region: 'Loreto', priceCents: 3800 };
    expect((await api('/api/admin/shipping/zones', { body, cookie: operatorCookie })).status).toBe(403);
    expect((await api('/api/admin/shipping/zones', { body, cookie: adminCookie })).status).toBe(200);
    const quote = await api('/api/cart/quote', {
      body: { items: [{ sku: 'espresso-250', grind: 'Grano entero', quantity: 1 }], zone: 'provincias', region: 'Loreto' }
    });
    expect(quote.json.shippingCents).toBe(3800);
    expect((await api('/api/admin/shipping/zones', { body: { ...body, region: 'Narnia' }, cookie: adminCookie })).status).toBe(400);
    await api('/api/admin/shipping/zones', { body: { action: 'delete-rate', zoneId: zone.id, region: 'Loreto' }, cookie: adminCookie });
  });

  it('compras: el operador registra, solo el administrador borra', async () => {
    const purchase = {
      purchasedOn: '2026-10-20',
      supplier: 'Proveedor CI',
      category: 'empaques',
      description: 'Bolsas de prueba CI',
      amountCents: 12345
    };
    expect((await api('/api/admin/purchases', { body: { action: 'create', ...purchase }, cookie: operatorCookie })).status).toBe(200);
    expect((await api('/api/admin/purchases', { body: { action: 'create', ...purchase, amountCents: 0 }, cookie: operatorCookie })).status).toBe(400);
    const sql = db();
    const [row] = await sql`select id from purchases where supplier = 'Proveedor CI' order by id desc limit 1`;
    await sql.end();
    expect((await api('/api/admin/purchases', { body: { action: 'delete', id: row.id }, cookie: operatorCookie })).status).toBe(403);
    expect((await api('/api/admin/purchases', { body: { action: 'delete', id: row.id }, cookie: adminCookie })).status).toBe(200);
  });

  it('un administrador no puede desactivarse a sí mismo', async () => {
    const sql = db();
    const [me] = await sql`select id from admin_users where email = ${ADMIN.email}`;
    await sql.end();
    const response = await api('/api/admin/users', {
      body: { action: 'update', id: me.id, name: 'Admin CI', role: 'admin', active: false },
      cookie: adminCookie
    });
    expect(response.status).toBe(409);
  });

  it('el operador no gestiona usuarios', async () => {
    const response = await api('/api/admin/users', {
      body: { action: 'create', email: `x-${randomUUID()}@codebrew.test`, name: 'X', role: 'admin' },
      cookie: operatorCookie
    });
    expect(response.status).toBe(403);
  });
});
