import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, db } from './helpers';

// Portada y página de producto con CATALOG_SOURCE=db (S5.3, valor por defecto): lo que se cambia en la base se ve en las
// páginas, y lo que el público no debe ver no aparece. Toca dos perfiles del seed y los deja como estaban.
const sql = db();
let original: { rollbackStatus: string; coldstartTagline: string | null };

const page = async (path: string) => {
  const response = await api(path);
  return { status: response.status, html: response.text };
};

beforeAll(async () => {
  const [rollback] = await sql`select status from products where slug = 'rollback'`;
  const [coldstart] = await sql`select pp.tagline from product_profiles pp join products p on p.id = pp.product_id where p.slug = 'coldstart'`;
  original = { rollbackStatus: rollback.status, coldstartTagline: coldstart.tagline };
});

afterAll(async () => {
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
