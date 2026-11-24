import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, db } from './helpers';

// Portada y página de producto con CATALOG_SOURCE=db (S5.3, valor por defecto): lo que se cambia en la base se ve en las
// páginas, y lo que el público no debe ver no aparece. Toca dos perfiles y la línea del seed y los deja como estaban.
// Tema y plantilla por línea (S5.9): crea su propia línea qa-tema y la borra al terminar.
const sql = db();
let original: { rollbackStatus: string; coldstartTagline: string | null; theme: Record<string, string>; template: string };

const page = async (path: string) => {
  const response = await api(path);
  return { status: response.status, html: response.text };
};

beforeAll(async () => {
  const [rollback] = await sql`select status from products where slug = 'rollback'`;
  const [coldstart] = await sql`select pp.tagline from product_profiles pp join products p on p.id = pp.product_id where p.slug = 'coldstart'`;
  const [line] = await sql`select theme, template from product_lines where slug = 'pipeline'`;
  original = { rollbackStatus: rollback.status, coldstartTagline: coldstart.tagline, theme: line.theme, template: line.template };
  await removeQaLine();
});

async function removeQaLine() {
  await sql`delete from product_variants where sku like 'qa-tema-%'`;
  await sql`delete from products where slug like 'qa-tema-%'`;
  await sql`delete from product_lines where slug = 'qa-tema'`;
}

afterAll(async () => {
  await sql`update product_lines set theme = ${sql.json(original.theme)}, template = ${original.template} where slug = 'pipeline'`;
  await removeQaLine();
  await sql`update products set status = ${original.rollbackStatus}::product_status where slug = 'rollback'`;
  await sql`update product_profiles set tagline = ${original.coldstartTagline} where product_id = (select id from products where slug = 'coldstart')`;
  await sql.end();
});

describe('páginas desde el catálogo en base de datos', () => {
  it('la portada lista los perfiles publicados de Pipeline', async () => {
    const { status, html } = await page('/');
    expect(status).toBe(200);
    for (const slug of ['hotfix', 'coldstart', 'deploy', 'merge', 'rollback']) expect(html).toContain(`href="/producto/${slug}"`);
  });

  it('la página de producto muestra el contenido editado en la base y oculta el tueste de un próximo', async () => {
    await sql`update product_profiles set tagline = 'Frase QA desde la base' where product_id = (select id from products where slug = 'coldstart')`;
    const { status, html } = await page('/producto/coldstart');
    expect(status).toBe(200);
    expect(html).toContain('Frase QA desde la base');
    expect(html).not.toContain('Molienda gruesa');
  });

  it('el precio de Hotfix sale de la base', async () => {
    const [variant] = await sql`select price_cents from product_variants where sku = 'hotfix-250'`;
    const { html } = await page('/producto/hotfix');
    expect(html).toMatch(new RegExp(`data-price="${variant.price_cents / 100}"[^>]*data-sku="hotfix-250"`));
  });

  it('un perfil en borrador deja de verse en la portada y su página responde 404', async () => {
    await sql`update products set status = 'draft' where slug = 'rollback'`;
    expect((await page('/producto/rollback')).status).toBe(404);
    expect((await page('/')).html).not.toContain('href="/producto/rollback"');
  });
});

describe('tema y plantilla de la línea', () => {
  it('cambiar el tema en la base cambia los colores de la línea en la portada y en el producto', async () => {
    await sql`update product_lines set theme = ${sql.json({ '--cb-terracotta-bright': '#123456', '--bg': 'url(x)' })} where slug = 'pipeline'`;
    const home = await page('/');
    expect(home.html).toMatch(/<section id="pipeline"[^>]*style="--cb-terracotta-bright:#123456"/);
    const product = await page('/producto/hotfix');
    expect(product.html).toMatch(/class="cb-product"[^>]*style="[^"]*--cb-terracotta-bright:#123456"/);
    // Lo que no es una variable segura no llega a la página.
    expect(product.html).not.toContain('url(x)');
  });

  it('una línea con una plantilla no registrada usa la base', async () => {
    const [{ id: lineId }] = await sql`
      insert into product_lines (slug, name, status, template) values ('qa-tema', 'Línea QA Tema', 'active', 'no-registrada') returning id`;
    const [{ id }] = await sql`
      insert into products (slug, name, roast, grinds, line_id, release_number, status, active)
      values ('qa-tema-cafe', 'Café QA Tema', 'Tueste claro', ${sql.json(['Grano entero'])}, ${lineId}, 1, 'active', true) returning id`;
    await sql`insert into product_profiles (product_id, tagline, description) values (${id}, 'Frase de la plantilla base', 'Descripción QA')`;
    await sql`insert into product_variants (product_id, sku, format, price_cents, stock) values (${id}, 'qa-tema-250', '250 g', 4200, 3)`;

    const { status, html } = await page('/producto/qa-tema-cafe');
    expect(status).toBe(200);
    expect(html).toContain('data-template="base"');
    expect(html).toContain('<title>Café QA Tema · Línea QA Tema — CodeBrew</title>');
    expect(html).toContain('Frase de la plantilla base');
    expect(html).toMatch(/data-price="42"[^>]*data-sku="qa-tema-250"/);
  });

  it('si Pipeline pierde su plantilla, la portada pinta la sección base', async () => {
    await sql`update product_lines set template = 'inexistente' where slug = 'pipeline'`;
    const { status, html } = await page('/');
    expect(status).toBe(200);
    expect(html).toContain('id="linea-pipeline"');
    expect(html).toContain('data-template="base"');
    await sql`update product_lines set template = ${original.template} where slug = 'pipeline'`;
  });
});
