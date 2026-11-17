import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, db } from './helpers';

// Tienda /tienda (S5.6) con CATALOG_SOURCE=db: todo lo publicado aparece sin tocar código. Crea su propia línea
// qa-tienda con un café y un pack, y la borra al terminar.
const sql = db();

async function cleanup() {
  await sql`delete from bundle_items where bundle_variant_id in (select id from product_variants where sku like 'qa-tienda-%')`;
  await sql`delete from product_variants where sku like 'qa-tienda-%'`;
  await sql`delete from products where slug like 'qa-tienda-%'`;
  await sql`delete from product_lines where slug = 'qa-tienda'`;
}

const card = (html: string, slug: string) => html.match(new RegExp(`<a class="store-card"[^>]*href="/producto/${slug}"[\\s\\S]*?</a>`))?.[0] ?? '';

beforeAll(async () => {
  await cleanup();
  const [{ id: lineId }] = await sql`
    insert into product_lines (slug, name, description, status, sort_order) values ('qa-tienda', 'Línea QA Tienda', 'Línea de prueba', 'active', 99) returning id`;
  const [{ id: coffee }] = await sql`
    insert into products (slug, name, roast, grinds, line_id, release_number, status, active)
    values ('qa-tienda-cafe', 'Café QA Tienda', 'Medio', ${sql.json(['Grano entero'])}, ${lineId}, 1, 'active', true) returning id`;
  await sql`insert into product_profiles (product_id, tagline) values (${coffee}, 'Recién llegado a la tienda')`;
  await sql`insert into product_variants (product_id, sku, format, price_cents, stock) values (${coffee}, 'qa-tienda-250', '250 g', 3900, 4), (${coffee}, 'qa-tienda-500', '500 g', 7000, 4)`;

  const [{ id: pack }] = await sql`
    insert into products (slug, name, roast, grinds, line_id, release_number, status, active)
    values ('qa-tienda-pack', 'Pack QA Dúo', 'Varios', ${sql.json(['Grano entero'])}, ${lineId}, 2, 'active', true) returning id`;
  const [{ id: packVariant }] = await sql`
    insert into product_variants (product_id, sku, format, price_cents, stock, bags) values (${pack}, 'qa-tienda-pack', 'Pack', 6500, 0, 2) returning id`;
  await sql`
    insert into bundle_items (bundle_variant_id, component_variant_id, quantity)
    select ${packVariant}, id, 2 from product_variants where sku = 'qa-tienda-250'`;
});

afterAll(async () => {
  await cleanup();
  await sql.end();
});

describe('tienda', () => {
  it('lista las líneas publicadas; los próximos llevan el chip Próximamente', async () => {
    const { status, text } = await api('/tienda');
    expect(status).toBe(200);
    expect(card(text, 'hotfix')).not.toContain('Próximamente');
    for (const slug of ['coldstart', 'deploy', 'merge', 'rollback']) expect(card(text, slug)).toContain('Próximamente');
    expect(text.indexOf('id="linea-pipeline"')).toBeLessThan(text.indexOf('id="linea-qa-tienda"'));
  });

  it('un producto nuevo activo aparece sin tocar código, con su precio desde', async () => {
    const coffee = card((await api('/tienda')).text, 'qa-tienda-cafe');
    expect(coffee).toContain('Café QA Tienda');
    expect(coffee).toContain('Recién llegado a la tienda');
    expect(coffee).toMatch(/Desde S\/\s*39\.00/);
  });

  it('un pack muestra su contenido y su disponibilidad sale de los componentes', async () => {
    const pack = card((await api('/tienda')).text, 'qa-tienda-pack');
    expect(pack).toContain('data-kind="pack"');
    expect(pack).toContain('Incluye 2 × Café QA Tienda 250 g');
    expect(pack).toMatch(/S\/\s*65\.00/);

    // Sin stock suficiente en el componente, el pack deja de estar disponible aunque su variante no tenga stock propio.
    await sql`update product_variants set stock = 1 where sku = 'qa-tienda-250'`;
    const product = await api('/api/catalog/products/qa-tienda-pack');
    expect(product.json).toMatchObject({ kind: 'pack', variants: [{ sku: 'qa-tienda-pack', available: false, components: [{ name: 'Café QA Tienda', format: '250 g', quantity: 2 }] }] });
    expect(card((await api('/tienda')).text, 'qa-tienda-pack')).toContain('Nuevo lote en camino');
    await sql`update product_variants set stock = 4 where sku = 'qa-tienda-250'`;
  });

  it('filtra por línea, disponibilidad y tipo con enlaces', async () => {
    const packs = (await api('/tienda?tipo=pack')).text;
    expect(card(packs, 'qa-tienda-pack')).not.toBe('');
    expect(card(packs, 'hotfix')).toBe('');

    const upcoming = (await api('/tienda?estado=proximamente')).text;
    expect(card(upcoming, 'coldstart')).not.toBe('');
    expect(card(upcoming, 'hotfix')).toBe('');
    expect(upcoming).not.toContain('id="linea-qa-tienda"');

    const line = (await api('/tienda?linea=qa-tienda')).text;
    expect(card(line, 'qa-tienda-cafe')).not.toBe('');
    expect(card(line, 'hotfix')).toBe('');
    expect(line).toContain('href="/tienda?linea=qa-tienda&amp;tipo=pack"');
  });

  it('el header y el pie enlazan a la tienda', async () => {
    const { text } = await api('/');
    expect(text.match(/href="\/tienda"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
