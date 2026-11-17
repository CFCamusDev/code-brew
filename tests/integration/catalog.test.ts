import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/lib/server/db/schema';
import { activateLine, archiveLine, publishProduct, type CatalogDeps } from '../../src/server/modules/catalog/application/catalog-use-cases';
import { PublicationError } from '../../src/server/modules/catalog/domain/catalog';
import { createDrizzleLineRepository, createDrizzleProductRepository } from '../../src/server/modules/catalog/infrastructure/drizzle-catalog-repositories';
import { FixedClock } from '../../src/server/shared/clock';
import { api, customer, db } from './helpers';

// Catálogo de punta a punta (S2.7): reglas de publicación contra PostgreSQL y lo que ve y puede comprar el público.
// Crea su propia línea y productos con prefijo qa-cat- y los borra al terminar; además comprueba el seed de Pipeline.
const sql = db();
// Drizzle ajusta los serializadores del cliente que recibe: usa su propia conexión para no alterar la de `sql`.
const drizzleClient = db();
const orm = drizzle(drizzleClient, { schema });
const clock = new FixedClock(new Date('2026-11-17T15:00:00Z'));
const run = <T>(work: (deps: CatalogDeps) => Promise<T>) =>
  orm.transaction(tx => work({ lines: createDrizzleLineRepository(tx), products: createDrizzleProductRepository(tx), clock }));

let lineId = 0;
let productId = 0;
let upcomingId = 0;

async function cleanup() {
  // Los pedidos de prueba referencian las variantes: se borran primero (sus líneas y reservas caen en cascada).
  await sql`delete from orders where id in (select i.order_id from order_items i join product_variants v on v.id = i.variant_id where v.sku like 'qa-cat-%')`;
  await sql`delete from product_variants where sku like 'qa-cat-%'`;
  await sql`delete from products where slug like 'qa-cat-%'`;
  await sql`delete from product_lines where slug like 'qa-cat-%'`;
}

beforeAll(async () => {
  await cleanup();
  [{ id: lineId }] = await sql`insert into product_lines (slug, name) values ('qa-cat-linea', 'Línea QA catálogo') returning id`;
  [{ id: productId }] = await sql`
    insert into products (slug, name, roast, grinds, line_id, release_number, active)
    values ('qa-cat-cafe', 'QA Café', 'Medio', ${sql.json(['Grano entero'])}, ${lineId}, 1, false) returning id`;
  [{ id: upcomingId }] = await sql`
    insert into products (slug, name, roast, grinds, line_id, release_number, status, active)
    values ('qa-cat-pronto', 'QA Pronto', 'Claro', ${sql.json(['Grano entero'])}, ${lineId}, 2, 'upcoming', false) returning id`;
  await sql`insert into product_profiles (product_id, tagline, revealed_fields) values (${upcomingId}, 'Muy pronto', ${sql.json(['tagline'])})`;
  await sql`insert into product_variants (product_id, sku, format, price_cents, stock) values (${upcomingId}, 'qa-cat-pronto-250', '250 g', 3600, 10)`;
});

afterAll(async () => {
  await cleanup();
  await Promise.all([sql.end(), drizzleClient.end()]);
});

const order = (sku: string) => api('/api/orders', { body: { items: [{ sku, grind: 'Grano entero', quantity: 1 }], customer, acceptedPolicies: true } });

describe('reglas de publicación contra la base de datos', () => {
  it('no se activa un producto sin variante activa, precio, imagen ni contenido, y no cambia nada', async () => {
    const error = await run(deps => publishProduct(deps, productId, 'active')).catch(caught => caught);
    expect(error).toBeInstanceOf(PublicationError);
    expect((error as PublicationError).issues).toEqual(['missing_tagline', 'missing_method', 'missing_description', 'missing_image', 'missing_active_variant']);
    const [row] = await sql`select status, active from products where id = ${productId}`;
    expect(row).toEqual({ status: null, active: false });
  });

  it('una presentación sin precio también impide lanzarlo', async () => {
    await sql`insert into product_profiles (product_id, tagline, method, description) values (${productId}, 'Frase', 'Espresso', 'Descripción')`;
    await sql`insert into product_media (product_id, view, url, alt) values (${productId}, 'front', '/qa/front.webp', 'Frente')`;
    await sql`insert into product_variants (product_id, sku, format, price_cents, stock) values (${productId}, 'qa-cat-cafe-250', '250 g', 0, 10)`;
    const error = await run(deps => publishProduct(deps, productId, 'active')).catch(caught => caught);
    expect((error as PublicationError).issues).toEqual(['missing_price']);
  });

  it('completo, se lanza: estado, venta y fecha de lanzamiento quedan sincronizados', async () => {
    await sql`update product_variants set price_cents = 3400 where sku = 'qa-cat-cafe-250'`;
    expect(await run(deps => publishProduct(deps, productId, 'active'))).toEqual({ from: 'draft', to: 'active' });
    const [row] = await sql`select status, active, launch_at from products where id = ${productId}`;
    expect(row).toMatchObject({ status: 'active', active: true });
    expect(new Date(row.launch_at).toISOString()).toBe('2026-11-17T15:00:00.000Z');
  });

  it('la línea se publica cuando tiene productos visibles', async () => {
    expect(await run(deps => activateLine(deps, lineId))).toEqual({ from: 'draft', to: 'active' });
    const line = await api('/api/catalog/lines/qa-cat-linea');
    expect(line.status).toBe(200);
    expect(line.json.products.map((product: { slug: string; status: string }) => [product.slug, product.status])).toEqual([
      ['qa-cat-cafe', 'active'],
      ['qa-cat-pronto', 'upcoming']
    ]);
  });
});

describe('lo que el público puede comprar', () => {
  it('un producto a la venta de una línea publicada se puede pedir', async () => {
    const created = await order('qa-cat-cafe-250');
    expect(created.status).toBe(201);
  });

  it('un producto próximamente no se compra, aunque tenga presentación, precio y stock', async () => {
    expect((await order('qa-cat-pronto-250')).status).toBe(409);
    // Aunque alguien deje encendido el indicador antiguo de venta, manda el estado del producto.
    await sql`update products set active = true where id = ${upcomingId}`;
    const blocked = await order('qa-cat-pronto-250');
    expect(blocked.status).toBe(409);
    expect(blocked.json.issues).toEqual([{ sku: 'qa-cat-pronto-250', message: 'Este producto ya no está disponible.' }]);
    await sql`update products set active = false where id = ${upcomingId}`;
  });

  it('al archivar la línea se oculta del catálogo y sus productos dejan de venderse', async () => {
    expect(await run(deps => archiveLine(deps, lineId))).toEqual({ from: 'active', to: 'archived' });
    expect((await api('/api/catalog/lines/qa-cat-linea')).status).toBe(404);
    expect((await api('/api/catalog/products/qa-cat-cafe')).status).toBe(404);
    const blocked = await order('qa-cat-cafe-250');
    expect(blocked.status).toBe(409);
    expect((await api('/api/cart/quote', { body: { items: [{ sku: 'qa-cat-cafe-250', grind: 'Grano entero', quantity: 1 }] } })).json.issues).toHaveLength(1);

    // Volver a publicarla la reactiva sin tocar los productos.
    await run(deps => activateLine(deps, lineId));
    expect((await order('qa-cat-cafe-250')).status).toBe(201);
  });
});

describe('seed de Pipeline (datos reproducibles)', () => {
  it('la línea Pipeline publica sus cinco perfiles en orden: Hotfix a la venta y cuatro próximamente', async () => {
    const { status, json } = await api('/api/catalog/lines/pipeline');
    expect(status).toBe(200);
    expect(json.products.map((product: { slug: string; status: string; releaseNumber: number }) => [product.releaseNumber, product.slug, product.status])).toEqual([
      [1, 'hotfix', 'active'],
      [2, 'coldstart', 'upcoming'],
      [3, 'deploy', 'upcoming'],
      [4, 'merge', 'upcoming'],
      [5, 'rollback', 'upcoming']
    ]);
  });

  it('Hotfix trae presentaciones e imágenes; un perfil próximo solo frase, método y receta', async () => {
    const hotfix = (await api('/api/catalog/products/hotfix')).json;
    expect(hotfix.variants.map((variant: { sku: string }) => variant.sku).sort()).toEqual(['hotfix-250', 'hotfix-500']);
    expect(hotfix.media.map((media: { view: string }) => media.view)).toEqual(['front', 'back', 'left', 'right']);
    const coldstart = (await api('/api/catalog/products/coldstart')).json;
    expect(Object.keys(coldstart.profile).sort()).toEqual(['method', 'recipe', 'recipeFor', 'tagline']);
    expect([coldstart.variants, coldstart.media]).toEqual([[], []]);
  });
});
