import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, db } from './helpers';

const sql = db();
let baseId: number;
async function cleanup() {
  await sql`delete from products where slug = 'qa-reveal-base'`;
  await sql`delete from product_lines where slug = 'qa-reveal-line'`;
}
beforeAll(async () => {
  await cleanup();
  const [line] = await sql`insert into product_lines(slug,name,status,template) values ('qa-reveal-line','Línea QA reveal','active','base') returning id`;
  const [product] = await sql`insert into products(slug,name,roast,grinds,status,active,line_id) values ('qa-reveal-base','QA Reveal','Medio','[]','upcoming',false,${line.id}) returning id`;
  baseId = product.id;
  await sql`insert into product_profiles(product_id) values (${baseId})`;
});
afterAll(async () => { await cleanup(); await sql.end(); });

describe('campos revelados en páginas públicas sin volver a desplegar', () => {
  it.each(['qa-reveal-base', 'coldstart'])('%s respeta revelados, ocultos y lanzamiento en HTML y API', async slug => {
    const [product] = await sql`select id, status, active from products where slug=${slug}`;
    const [profile] = await sql`select * from product_profiles where product_id=${product.id}`;
    try {
      await sql`update product_profiles set description='Descripción QA visible al revelar', notes=${sql.json(['Nota QA secreta'])}, facts=${sql.json([{ label: 'Origen', value: 'Origen QA secreto' }])}, cup_profile=${sql.json([{ attribute: 'Dulzor QA', level: 6 }])}, recipe=${sql.json([{ label: 'Dosis QA', value: '18 gramos QA' }])}, recipe_for='Método QA', revealed_fields=${sql.json(['tagline','method'])} where product_id=${product.id}`;
      const hidden = await api(`/producto/${slug}`);
      expect(hidden.status).toBe(200);
      for (const secret of ['Descripción QA visible al revelar', 'Nota QA secreta', 'Origen QA secreto', 'Dulzor QA', '18 gramos QA', 'Método QA']) expect(hidden.text).not.toContain(secret);
      expect(hidden.text).toContain('data-reveal-field="description" data-revealed="false"');
      expect(hidden.text).toContain('aria-hidden="true"');
      expect(hidden.text).toContain('Precio y presentaciones: Se revela en su lanzamiento.');
      expect(hidden.text).not.toContain('add-to-cart');
      expect((await api(`/api/catalog/products/${slug}`)).json.profile.description).toBeUndefined();

      await sql`update product_profiles set revealed_fields=${sql.json(['tagline','method','description','notes'])} where product_id=${product.id}`;
      const partial = await api(`/producto/${slug}`);
      expect(partial.text).toContain('Descripción QA visible al revelar');
      expect(partial.text).toContain('Nota QA secreta');
      expect(partial.text).not.toContain('Origen QA secreto');
      expect(partial.text).toContain('data-reveal-field="description" data-revealed="true"');
      expect(partial.text).toContain('data-reveal-field="facts" data-revealed="false"');
      expect((await api(`/api/catalog/products/${slug}`)).json.profile.description).toBe('Descripción QA visible al revelar');

      await sql`update product_profiles set revealed_fields=${sql.json(['tagline','method','description','notes','facts','cupProfile','recipe'])} where product_id=${product.id}`;
      const revealed = await api(`/producto/${slug}`);
      expect(revealed.text).toContain('Origen QA secreto');
      expect(revealed.text).toContain('Dulzor QA');
      expect(revealed.text).toContain('18 gramos QA');
      expect(revealed.text).toContain('Método QA');
      expect(revealed.text).not.toContain('Información por revelar.');

      await sql`update product_profiles set revealed_fields='[]' where product_id=${product.id}`;
      await sql`update products set status='active',active=true where id=${product.id}`;
      const active = await api(`/producto/${slug}`);
      expect(active.text).toContain('Descripción QA visible al revelar');
      expect(active.text).toContain('Origen QA secreto');
      expect(active.text).not.toContain('Precio y presentaciones: Se revela en su lanzamiento.');
      expect(active.text).not.toContain('data-revealed="false"');
    } finally {
      await sql`update products set status=${product.status},active=${product.active} where id=${product.id}`;
      await sql`update product_profiles set description=${profile.description},notes=${sql.json(profile.notes)},facts=${sql.json(profile.facts)},cup_profile=${sql.json(profile.cup_profile)},recipe=${sql.json(profile.recipe)},recipe_for=${profile.recipe_for},revealed_fields=${sql.json(profile.revealed_fields)} where product_id=${product.id}`;
    }
  });
});
