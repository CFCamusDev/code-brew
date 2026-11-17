import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOG_CACHE_CONTROL, publicLineSchema, publicProductSchema } from '../../src/contracts/catalog';
import { api, db } from './helpers';

// Endpoints públicos del catálogo (S2.6). Crea su propia línea y productos con prefijo qa- y los borra al terminar,
// para no depender del seed ni pisar los datos de otras pruebas.
const sql = db();
let lineId = 0;
let draftLineId = 0;

async function product(slug: string, line: number, status: string, release: number) {
  const [row] = await sql`
    insert into products (slug, name, roast, grinds, line_id, release_number, status, active)
    values (${slug}, ${'QA ' + slug}, 'Medio', ${sql.json(['Grano entero'])}, ${line}, ${release}, ${status}, ${status === 'active'})
    returning id`;
  return row.id as number;
}

beforeAll(async () => {
  await sql`delete from products where slug like 'qa-%'`;
  await sql`delete from product_lines where slug like 'qa-%'`;
  [{ id: lineId }] = await sql`insert into product_lines (slug, name, status, theme, template) values ('qa-linea', 'Línea QA', 'active', ${sql.json({ '--accent': '#1f4a35' })}, 'base') returning id`;
  [{ id: draftLineId }] = await sql`insert into product_lines (slug, name, status) values ('qa-borrador', 'Línea en preparación', 'draft') returning id`;

  const active = await product('qa-activo', lineId, 'active', 1);
  await sql`insert into product_profiles (product_id, tagline, method, description, notes, colors) values (${active}, 'Frase activa', 'Espresso', 'Descripción completa', ${sql.json(['Cacao'])}, ${sql.json({ color: '#1f4a35' })})`;
  await sql`insert into product_media (product_id, view, url, alt) values (${active}, 'front', '/qa/front.webp', 'Frente')`;
  await sql`insert into product_variants (product_id, sku, format, price_cents, stock) values (${active}, 'qa-activo-250', '250 g', 3400, 5), (${active}, 'qa-activo-500', '500 g', 6000, 0)`;

  const upcoming = await product('qa-pronto', lineId, 'upcoming', 2);
  await sql`insert into product_profiles (product_id, tagline, method, description, revealed_fields) values (${upcoming}, 'Frase revelada', 'Cold brew', 'Descripción secreta', ${sql.json(['tagline'])})`;
  await sql`insert into product_variants (product_id, sku, format, price_cents, stock) values (${upcoming}, 'qa-pronto-250', '250 g', 3600, 10)`;

  await product('qa-borrador-producto', lineId, 'draft', 3);
  await product('qa-en-linea-borrador', draftLineId, 'active', 1);
});

afterAll(async () => {
  await sql`delete from product_variants where sku like 'qa-%'`;
  await sql`delete from products where slug like 'qa-%'`;
  await sql`delete from product_lines where slug like 'qa-%'`;
  await sql.end();
});

describe('GET /api/catalog/lines/[slug]', () => {
  it('devuelve la línea publicada con sus productos visibles en orden y caché corta', async () => {
    const { status, json, headers } = await api('/api/catalog/lines/qa-linea');
    expect(status).toBe(200);
    expect(headers.get('cache-control')).toBe(CATALOG_CACHE_CONTROL);
    const line = publicLineSchema.parse(json);
    expect(line.products.map(item => [item.slug, item.status, item.tagline, item.fromPriceCents])).toEqual([
      ['qa-activo', 'active', 'Frase activa', 3400],
      ['qa-pronto', 'upcoming', 'Frase revelada', null]
    ]);
  });

  it('una línea en borrador o inexistente responde 404', async () => {
    expect((await api('/api/catalog/lines/qa-borrador')).status).toBe(404);
    expect((await api('/api/catalog/lines/qa-no-existe')).status).toBe(404);
    expect((await api('/api/catalog/lines/QA%20mal')).status).toBe(404);
  });
});

describe('GET /api/catalog/products/[slug]', () => {
  it('a la venta: ficha completa, presentaciones con disponibilidad e imágenes', async () => {
    const { status, json } = await api('/api/catalog/products/qa-activo');
    expect(status).toBe(200);
    const product = publicProductSchema.parse(json);
    expect(product.profile).toMatchObject({ tagline: 'Frase activa', method: 'Espresso', description: 'Descripción completa', notes: ['Cacao'] });
    expect(product.variants).toEqual([
      { sku: 'qa-activo-250', format: '250 g', priceCents: 3400, available: true },
      { sku: 'qa-activo-500', format: '500 g', priceCents: 6000, available: false }
    ]);
    expect(product.media).toEqual([{ view: 'front', url: '/qa/front.webp', alt: 'Frente' }]);
  });

  it('un producto próximamente no expone campos no revelados, precios ni imágenes', async () => {
    const { status, json, text } = await api('/api/catalog/products/qa-pronto');
    expect(status).toBe(200);
    const product = publicProductSchema.parse(json);
    expect(product.profile).toEqual({ tagline: 'Frase revelada' });
    expect([product.variants, product.media, product.grinds, product.roast]).toEqual([[], [], [], null]);
    expect(text).not.toContain('Descripción secreta');
    expect(text).not.toContain('3600');
  });

  it('borradores y productos de líneas no publicadas responden 404', async () => {
    expect((await api('/api/catalog/products/qa-borrador-producto')).status).toBe(404);
    expect((await api('/api/catalog/products/qa-en-linea-borrador')).status).toBe(404);
    expect((await api('/api/catalog/products/qa-no-existe')).status).toBe(404);
  });
});
