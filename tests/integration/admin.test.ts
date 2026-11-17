import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, api, BASE_URL, customer, db, login, OPERATOR } from './helpers';

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
  const created = await api('/api/orders', {
    body: { items: [{ sku: 'espresso-250', grind: 'Grano entero', quantity: 1 }], customer, acceptedPolicies: true }
  });
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
    expect(page.headers.get('location')).toBe('/admin');
  });

  it('el operador no entra a usuarios', async () => {
    expect((await api('/admin/usuarios', { cookie: operatorCookie })).headers.get('location')).toBe('/admin');
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

describe('diagnóstico de errores', () => {
  it('solo un administrador puede forzar un error, y el servidor responde 500', async () => {
    expect((await api('/api/admin/diagnostico', { body: {} })).status).toBe(401);
    expect((await api('/api/admin/diagnostico', { body: {}, cookie: operatorCookie })).status).toBe(403);
    expect((await api('/api/admin/diagnostico', { body: {}, cookie: adminCookie })).status).toBe(500);
  });

  it('las respuestas del servidor llevan un X-Request-Id válido y distinto por petición', async () => {
    // Directo a Node, el id es el que llega en la cabecera (o uno generado); detrás de Nginx lo fija Nginx. En ambos
    // casos la respuesta devuelve un id seguro para buscar en los logs.
    const ids = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const response = await fetch(`${BASE_URL}/api/health`);
      const id = response.headers.get('x-request-id') ?? '';
      expect(id).toMatch(/^[A-Za-z0-9._-]{8,64}$/);
      ids.add(id);
    }
    expect(ids.size).toBe(3);
  });
});

describe('productos y stock', () => {
  it('el operador no cambia precios, el administrador sí y se ve en la página de compra de Hotfix', async () => {
    const id = await variantId('hotfix-250');
    const update = { action: 'update', format: '250 g', priceCents: 3700, bags: 1, active: true };
    expect((await api(`/api/admin/products/variants/${id}`, { body: update, cookie: operatorCookie })).status).toBe(403);
    expect((await api(`/api/admin/products/variants/${id}`, { body: update, cookie: adminCookie })).status).toBe(200);
    try {
      const page = await api('/producto/hotfix');
      expect(page.status).toBe(200);
      expect(page.text).toContain('S/ 37.00');
      expect(page.text).toContain('data-price="37"');
    } finally {
      const restored = await api(`/api/admin/products/variants/${id}`, { body: { ...update, priceCents: 3400 }, cookie: adminCookie });
      expect(restored.status).toBe(200);
    }
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

describe('inicio del panel', () => {
  const kpis = async (cookie: string) => {
    const { status, text } = await api('/admin', { cookie });
    expect(status).toBe(200);
    return Object.fromEntries([...text.matchAll(/data-kpi="(\w+)" data-value="(\d+)"/g)].map(([, key, value]) => [key, Number(value)]));
  };

  it('una venta pagada hoy suma a ventas del día, del mes y a “por preparar”', async () => {
    const before = await kpis(operatorCookie);
    const id = await paidOrder();
    const sql = db();
    const [order] = await sql`select total_cents from orders where id = ${id}`;
    await sql.end();
    const after = await kpis(operatorCookie);

    expect(after.todayOrders).toBe(before.todayOrders + 1);
    expect(after.todayCents).toBe(before.todayCents + order.total_cents);
    expect(after.monthOrders).toBe(before.monthOrders + 1);
    expect(after.toPrepare).toBe(before.toPrepare + 1);
  });

  it('cuenta pedidos sin pagar de más de 24 h y no cuenta los reembolsados como venta', async () => {
    const before = await kpis(adminCookie);
    const created = await api('/api/orders', {
      body: { items: [{ sku: 'espresso-250', grind: 'Grano entero', quantity: 1 }], customer, acceptedPolicies: true }
    });
    const refunded = await paidOrder();
    const sql = db();
    try {
      await sql`update orders set created_at = now() - interval '25 hours' where id = ${created.json.id}`;
      await sql`update orders set status = 'refunded' where id = ${refunded}`;
    } finally {
      await sql.end();
    }
    const after = await kpis(adminCookie);
    expect(after.abandoned).toBe(before.abandoned + 1);
    expect(after.todayOrders).toBe(before.todayOrders);
  });

  it('los gráficos respetan el rango y muestran lo vendido', async () => {
    await paidOrder();
    const week = await api('/admin?rango=7', { cookie: adminCookie });
    expect(week.text.match(/class="col"/g)).toHaveLength(7);
    expect(week.text).toContain('Espresso Amazonas · 250 g');
    expect((await api('/admin?rango=90', { cookie: adminCookie })).text.match(/class="col"/g)).toHaveLength(90);
    expect((await api('/admin?rango=999', { cookie: adminCookie })).text.match(/class="col"/g)).toHaveLength(30);
  });

  it('lista el stock bajo', async () => {
    const sql = db();
    await sql`update product_variants set stock = 0 where sku = 'microlote-temporada'`;
    await sql.end();
    const { text } = await api('/admin', { cookie: adminCookie });
    expect(text).toContain('Microlote de Temporada · 250 g');
    expect(text).toContain('Agotado');
  });
});

describe('hoja de despacho', () => {
  it('imprime varios pedidos sin montos ni datos de pago', async () => {
    const first = await paidOrder();
    const second = await paidOrder();
    const sql = db();
    const numbers = await sql`select number from orders where id in (${first}, ${second}) order by number`;
    await sql.end();

    const page = await api(`/admin/despacho?ids=${first},${second},no-es-un-id`, { cookie: operatorCookie });
    expect(page.status).toBe(200);
    expect(page.text.match(/class="sheet"/g)).toHaveLength(2);
    for (const { number } of numbers) expect(page.text).toContain(`CB-${String(number).padStart(6, '0')}`);
    expect(page.text).toContain(customer.address);
    expect(page.text).not.toMatch(/S\/\s?\d/);
  });

  it('responde 404 sin pedidos válidos y exige sesión', async () => {
    expect((await api('/admin/despacho?ids=abc', { cookie: adminCookie })).status).toBe(404);
    expect((await api(`/admin/despacho?ids=${randomUUID()}`)).status).toBe(302);
  });

  it('la cola “por preparar” permite seleccionar pedidos para imprimir', async () => {
    const page = await api('/admin/pedidos?estado=paid', { cookie: adminCookie });
    expect(page.text).toContain('class="select-order"');
    expect(page.text).toContain('Imprimir hojas de despacho');
    expect((await api('/admin/pedidos?estado=delivered', { cookie: adminCookie })).text).not.toContain('class="select-order"');
  });
});

describe('filtro por fechas y exportación', () => {
  const limaDate = (offsetDays = 0) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(Date.now() + offsetDays * 86_400_000));

  it('exige sesión y fechas válidas', async () => {
    expect((await api('/api/admin/export/pedidos')).status).toBe(401);
    expect((await api('/api/admin/export/pedidos?desde=23-10-2026', { cookie: adminCookie })).status).toBe(400);
    expect((await api('/api/admin/export/clientes', { cookie: adminCookie })).status).toBe(404);
  });

  it('exporta pedidos del rango en CSV para Excel y neutraliza fórmulas', async () => {
    const today = await api('/api/orders', {
      body: {
        items: [{ sku: 'espresso-250', grind: 'Grano entero', quantity: 2 }],
        customer: { ...customer, name: '=HYPERLINK("http://x") Cliente' },
        acceptedPolicies: true
      }
    });
    const old = await api('/api/orders', {
      body: { items: [{ sku: 'espresso-250', grind: 'Grano entero', quantity: 1 }], customer, acceptedPolicies: true }
    });
    const sql = db();
    const todayRow = { number: today.json.number as number };
    const oldRow = { number: old.json.number as number };
    await sql`update orders set created_at = now() - interval '40 days' where id = ${old.json.id}`;
    await sql.end();

    const csv = await api(`/api/admin/export/pedidos?desde=${limaDate()}&hasta=${limaDate()}`, { cookie: operatorCookie });
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csv.headers.get('content-disposition')).toContain('attachment');
    // text() descarta el BOM al decodificar: se revisan los bytes que recibe Excel.
    const raw = await fetch(`${process.env.INTEGRATION_BASE_URL ?? 'http://127.0.0.1:4321'}/api/admin/export/pedidos?desde=${limaDate()}`, {
      headers: { Cookie: operatorCookie }
    });
    expect([...new Uint8Array(await raw.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv.text).toContain('Pedido,Fecha,Estado,Cliente');
    expect(csv.text).toContain(`CB-${String(todayRow.number).padStart(6, '0')}`);
    expect(csv.text).not.toContain(`CB-${String(oldRow.number).padStart(6, '0')}`);
    expect(csv.text).toContain('2× Espresso Amazonas 250 g (Grano entero)');
    expect(csv.text).toContain(`"'=HYPERLINK(""http://x"") Cliente"`);
  });

  it('la lista aplica el rango y cuenta los estados dentro de él', async () => {
    const page = await api(`/admin/pedidos?desde=${limaDate(1)}`, { cookie: adminCookie });
    expect(page.status).toBe(200);
    expect(page.text).toContain('No hay pedidos con estos filtros.');
    expect(page.text).toMatch(/Todos<span>0<\/span>/);
  });

  it('exporta compras y movimientos de stock', async () => {
    await api('/api/admin/purchases', {
      body: { action: 'create', purchasedOn: limaDate(), supplier: 'Tostaduría Export CI', category: 'tueste', description: 'Tueste lote export', amountCents: 25050 },
      cookie: operatorCookie
    });
    const purchasesCsv = await api(`/api/admin/export/compras?desde=${limaDate()}&hasta=${limaDate()}`, { cookie: adminCookie });
    expect(purchasesCsv.text).toContain('Tostaduría Export CI');
    expect(purchasesCsv.text).toContain('250.50');

    const stockCsv = await api(`/api/admin/export/stock?desde=${limaDate()}`, { cookie: adminCookie });
    expect(stockCsv.status).toBe(200);
    expect(stockCsv.text).toContain('Fecha,Producto,SKU,Presentación,Motivo');
  });
});

describe('clientes', () => {
  it('agrupa por correo sin importar mayúsculas y suma solo pedidos pagados', async () => {
    const email = `cliente-${randomUUID().slice(0, 8)}@codebrew.test`;
    const order = (mail: string, quantity: number) =>
      api('/api/orders', {
        body: {
          items: [{ sku: 'pack-developer', grind: 'Ambos en grano', quantity }],
          customer: { ...customer, name: 'Rosa Fiel', email: mail },
          acceptedPolicies: true
        }
      });
    const a = await order(email, 1);
    const b = await order(email.toUpperCase(), 2);
    await order(email, 1); // queda pendiente: no cuenta como compra
    const sql = db();
    const paid = await sql`update orders set status = 'paid', paid_at = now() where id in (${a.json.id}, ${b.json.id}) returning total_cents`;
    await sql.end();
    const expected = paid.reduce((sum, row) => sum + row.total_cents, 0);

    const list = await api(`/admin/clientes?q=${encodeURIComponent(email)}`, { cookie: operatorCookie });
    expect(list.status).toBe(200);
    expect(list.text.match(/class="row-link"/g)).toHaveLength(1);
    expect(list.text).toContain('Rosa Fiel');

    const detail = await api(`/admin/clientes/${encodeURIComponent(email)}`, { cookie: operatorCookie });
    expect(detail.status).toBe(200);
    expect(detail.text).toMatch(/data-kpi="paidOrders" data-value="2"/);
    expect(detail.text).toContain(`data-kpi="totalCents" data-value="${expected}"`);
    expect(detail.text).toContain('Pack Developer · 2 × 250 g');
  });

  it('responde 404 a un cliente que no existe', async () => {
    expect((await api('/admin/clientes/nadie%40codebrew.test', { cookie: adminCookie })).status).toBe(404);
  });
});

describe('pedidos abandonados', () => {
  const secret = process.env.CRON_SECRET;
  const cron = (token?: string) =>
    api('/api/cron/pedidos-abandonados', { method: 'POST', body: {}, headers: token ? { Authorization: `Bearer ${token}` } : {} });

  async function oldPendingOrder(withLiveCulqiOrder = false) {
    const created = await api('/api/orders', {
      body: { items: [{ sku: 'espresso-250', grind: 'Grano entero', quantity: 1 }], customer, acceptedPolicies: true }
    });
    const sql = db();
    try {
      await sql`update orders set created_at = now() - interval '49 hours' where id = ${created.json.id}`;
      if (withLiveCulqiOrder) {
        await sql`
          insert into payments (order_id, provider_reference, method, status, amount_cents, expires_at)
          values (${created.json.id}, ${`ord_test_${randomUUID()}`}, 'order', 'pending', 4900, now() + interval '6 hours')`;
      }
    } finally {
      await sql.end();
    }
    return created.json.id as string;
  }

  const statusOf = async (id: string) => {
    const sql = db();
    try {
      const [order] = await sql`select status from orders where id = ${id}`;
      return order.status as string;
    } finally {
      await sql.end();
    }
  };

  it.runIf(secret)('la tarea exige el token', async () => {
    expect((await cron()).status).toBe(401);
    expect((await cron('adivinando')).status).toBe(401);
  });

  it.runIf(secret)('cancela pendientes de más de 48 h y respeta códigos de pago vigentes, una sola vez', async () => {
    const abandoned = await oldPendingOrder();
    const withCode = await oldPendingOrder(true);
    const recent = (
      await api('/api/orders', {
        body: { items: [{ sku: 'espresso-250', grind: 'Grano entero', quantity: 1 }], customer, acceptedPolicies: true }
      })
    ).json.id;

    const first = await cron(secret);
    expect(first.status).toBe(200);
    expect(first.json.cancelled).toBeGreaterThanOrEqual(1);
    expect(await statusOf(abandoned)).toBe('cancelled');
    expect(await statusOf(withCode)).toBe('pending');
    expect(await statusOf(recent)).toBe('pending');

    expect((await cron(secret)).json.cancelled).toBe(0);
    const sql = db();
    const events = await sql`select note from order_events where order_id = ${abandoned}`;
    await sql.end();
    expect(events).toHaveLength(1);
    expect(events[0].note).toContain('Cancelado automáticamente');
  });

  it('el botón manual es solo para administradores', async () => {
    expect((await api('/api/admin/tareas/cancelar-abandonados', { body: {}, cookie: operatorCookie })).status).toBe(403);
    const manual = await api('/api/admin/tareas/cancelar-abandonados', { body: {}, cookie: adminCookie });
    expect(manual.status).toBe(200);
    expect(typeof manual.json.cancelled).toBe('number');
  });
});
