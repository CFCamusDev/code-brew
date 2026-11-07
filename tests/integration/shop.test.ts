import { describe, expect, it } from 'vitest';
import { ADMIN, api, customer, db, login } from './helpers';
import { version } from '../../package.json';

const espresso = { sku: 'espresso-250', grind: 'Grano entero', quantity: 1 };
const pack = { sku: 'pack-developer', grind: 'Ambos en grano', quantity: 1 };

describe('sitio', () => {
  it('muestra los cinco perfiles del Pipeline y cuatro próximos lanzamientos', async () => {
    const { status, text } = await api('/');
    expect(status).toBe(200);
    const section = text.match(/<section id="pipeline"[\s\S]*?<\/section>/)?.[0];
    expect(section).toBeTruthy();
    expect(section).toContain('Hotfix');
    expect(section?.match(/class="cb-pouch-lock"/g)).toHaveLength(4);
    for (const slug of ['hotfix', 'coldstart', 'deploy', 'merge', 'rollback']) {
      expect(section).toContain(`href="/producto/${slug}"`);
    }
    expect(section).toContain('Comprar Hotfix');
    expect(text).not.toContain('id="productos"');
    for (const name of ['Espresso Amazonas', 'Pack Developer', 'Microlote de Temporada', 'demo/espresso', 'demo/microlote']) {
      expect(section).not.toContain(name);
    }
    expect(text).toContain('https://www.tiktok.com/@coffecodebrew');
    expect(text).not.toContain('https://www.tiktok.com/@codebrew1');
  });
  it('responde la salud de app y base de datos', async () => {
    const { status, json } = await api('/api/health');
    expect(status).toBe(200);
    expect(json).toEqual({ status: 'ok', database: 'ok', version });
  });

  it('la página de Hotfix muestra precios y SKU desde la base de datos', async () => {
    const { status, text } = await api('/producto/hotfix');
    expect(status).toBe(200);
    expect(text).toContain('S/ 34.00');
    expect(text).toContain('data-sku="monteverde-250"');
    expect(text).toContain('data-price="34"');
  });

  it.each(['coldstart', 'deploy', 'merge', 'rollback'])('el perfil %s no revela precio ni permite comprar antes de su lanzamiento', async slug => {
    const page = await api(`/producto/${slug}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('PRÓXIMAMENTE');
    expect(page.text).toContain('Se revela en su lanzamiento.');
    expect(page.text).not.toContain('class="product-price"');
    expect(page.text).not.toContain('add-to-cart');
  });

  it('sirve los recursos y el video de la landing con soporte de rangos', async () => {
    const page = await api('/');
    const assets = [...new Set([...page.text.matchAll(/(?:src|href)="(\/(?:_astro|assets)\/[^"?#]+)(?:[?#][^"]*)?"/g)].map(match => match[1]))];
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) {
      const response = await api(asset, { method: 'HEAD' });
      expect(response.status, asset).toBe(200);
      expect(response.headers.get('content-type'), asset).not.toContain('text/html');
    }
    const video = await api('/assets/brand/ritual-v60.mp4', { headers: { Range: 'bytes=0-1023' } });
    expect(video.status).toBe(206);
    expect(video.headers.get('content-range')).toMatch(/^bytes 0-1023\/\d+$/);
  });

  it('renderiza las pantallas del panel con una sesión válida', async () => {
    const cookie = await login(ADMIN);
    for (const path of ['/admin', '/admin/pedidos', '/admin/productos', '/admin/envios', '/admin/clientes', '/admin/usuarios']) {
      expect((await api(path, { cookie })).status, path).toBe(200);
    }
  });
});

describe('cotización y envíos', () => {
  const quote = (items: unknown[], zone?: string, region?: string) => api('/api/cart/quote', { body: { items, zone, region } });

  it('Lima cobra S/ 15 y es gratis desde 3 bolsas (el pack cuenta 2)', async () => {
    expect((await quote([pack], 'lima', 'Lima')).json.shippingCents).toBe(1500);
    const free = await quote([pack, espresso], 'lima', 'Lima');
    expect(free.json.bags).toBe(3);
    expect(free.json.shippingCents).toBe(0);
  });

  it('provincias cobra desde S/ 20 aunque lleve 3 bolsas', async () => {
    const { json } = await quote([{ ...espresso, quantity: 3 }], 'provincias', 'Cusco');
    expect(json.shippingCents).toBe(2000);
    expect(json.totalCents).toBe(3 * 3400 + 2000);
  });

  it('no deja usar la tarifa de Lima para otro departamento', async () => {
    const { json } = await quote([espresso], 'lima', 'Cusco');
    expect(json.shippingCents).toBeNull();
    expect(json.issues[0].message).toContain('no atiende Cusco');
  });

  it('avisa cuando no hay stock suficiente', async () => {
    const sql = db();
    await sql`update product_variants set stock = 1 where sku = 'microlote-temporada'`;
    await sql.end();
    const { json } = await quote([{ sku: 'microlote-temporada', grind: 'Grano entero', quantity: 2 }]);
    expect(json.lines).toHaveLength(0);
    expect(json.issues[0].message).toContain('Solo queda 1 unidad');
  });
});

describe('pedidos', () => {
  it('rechaza datos inválidos', async () => {
    expect((await api('/api/orders', { body: { items: [espresso], customer: { ...customer, phone: '123' } } })).status).toBe(400);
    expect((await api('/api/orders', { body: 'no es un pedido' })).status).toBe(400);
  });

  it('rechaza productos, moliendas o zonas que no existen', async () => {
    const cases = [
      { items: [{ ...espresso, sku: 'oro-puro' }], customer, acceptedPolicies: true },
      { items: [{ ...espresso, grind: 'Molido para moka' }], customer, acceptedPolicies: true },
      { items: [espresso], customer: { ...customer, zone: 'marte' }, acceptedPolicies: true }
    ];
    for (const body of cases) expect((await api('/api/orders', { body })).status).toBe(409);
  });

  it('crea el pedido con precios del servidor, ignorando precios enviados por el navegador', async () => {
    const created = await api('/api/orders', { body: { items: [{ ...espresso, quantity: 2, price: 1 }], customer, acceptedPolicies: true } });
    expect(created.status).toBe(201);
    const page = await api(`/pedido/${created.json.id}`);
    expect(page.status).toBe(200);
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(page.text).toContain('S/ 68.00');
    expect(page.text).toContain('S/ 83.00');
  });

  it('responde 404 a pedidos inexistentes o ids mal formados', async () => {
    expect((await api('/pedido/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await api('/pedido/abc')).status).toBe(404);
  });
});

describe('pagos', () => {
  it.skipIf(process.env.CULQI_SECRET_KEY)('sin llaves de Culqi el pago en línea queda desactivado', async () => {
    const created = await api('/api/orders', { body: { items: [espresso], customer, acceptedPolicies: true } });
    const session = await api('/api/payments/session', { body: { orderId: created.json.id } });
    expect(session.status).toBe(503);
    expect(session.json.status).toBe('disabled');
  });

  it('valida la solicitud de cobro', async () => {
    expect((await api('/api/payments/charge', { body: { orderId: 'x', tokenId: 'tkn', email: 'a@b.pe' } })).status).toBe(400);
  });
});

describe('webhook de Culqi', () => {
  const secret = process.env.CULQI_WEBHOOK_SECRET;
  const event = { type: 'order.status.changed', data: JSON.stringify({ id: 'ord_test_desconocida', state: 'paid' }) };

  it.skipIf(secret)('sin secreto el webhook queda desactivado', async () => {
    expect((await api('/api/webhooks/culqi', { body: event })).status).toBe(503);
  });

  it.runIf(secret)('exige la clave secreta', async () => {
    expect((await api('/api/webhooks/culqi', { body: event })).status).toBe(401);
    expect((await api('/api/webhooks/culqi?key=adivinando', { body: event })).status).toBe(401);
  });

  it.runIf(secret)('ignora órdenes desconocidas y otros eventos sin tocar pedidos', async () => {
    const unknown = await api(`/api/webhooks/culqi?key=${secret}`, { body: event });
    expect(unknown.json.result).toBe('ignored');
    const other = await api(`/api/webhooks/culqi?key=${secret}`, { body: { type: 'charge.creation.succeeded', data: '{}' } });
    expect(other.json.ignored).toBe('charge.creation.succeeded');
  });
});
