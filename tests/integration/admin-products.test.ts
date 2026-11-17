import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, OPERATOR, api, db, login } from './helpers';

const sql = db();
let admin: string;
let operator: string;
let lineId: number;
let productId: number;
let slug: string;
const details = { name: 'QA Nuevo Pipeline', roast: 'Medio', grinds: ['Grano entero'], imageUrl: null, tagline: 'Muy pronto QA', status: 'draft', releaseNumber: 999, launchAt: '2027-01-20T15:00:00-05:00' };
async function cleanup() { await sql`delete from products where slug like 'qa-nuevo-pipeline%'`; }
beforeAll(async () => {
  await cleanup(); admin = await login(ADMIN); operator = await login(OPERATOR);
  [{ id: lineId }] = await sql`select id from product_lines where slug='pipeline'`;
});
afterAll(async () => { await cleanup(); await sql.end(); });
describe('producto nuevo dentro de una línea', () => {
  it('protege el alta y valida línea, fecha y número de entrega', async () => {
    expect((await api('/api/admin/products', { cookie: operator, body: { ...details, lineId } })).status).toBe(403);
    expect((await api('/api/admin/products', { cookie: admin, body: { ...details, lineId: 2147483647 } })).status).toBe(404);
    expect((await api('/api/admin/products', { cookie: admin, body: { ...details, lineId, releaseNumber: 0 } })).status).toBe(400);
    const created = await api('/api/admin/products', { cookie: admin, body: { ...details, lineId } });
    expect(created.status).toBe(201); productId = created.json.id; slug = created.json.slug;
    expect((await sql`select status,active,line_id,release_number,launch_at from products where id=${productId}`)[0]).toMatchObject({ status: 'draft', active: false, line_id: lineId, release_number: 999 });
    expect((await api(`/producto/${slug}`)).status).toBe(404);
  });
  it('ofrece vista previa autenticada sin publicar el borrador', async () => {
    expect((await api(`/admin/productos/preview?slug=${slug}`)).status).toBe(302);
    const preview = await api(`/admin/productos/preview?slug=${slug}`, { cookie: admin });
    expect(preview.status).toBe(200);
    expect(preview.headers.get('cache-control')).toContain('no-store');
    expect(preview.text).toContain('noindex');
    expect(preview.text).toContain(details.name);
    expect((await api(`/api/catalog/products/${slug}`)).status).toBe(404);
  });
  it('anuncia con validación y muestra el producto sin renders propios en portada, tienda y página', async () => {
    const missing = await api(`/api/admin/products/${productId}`, { cookie: admin, body: { ...details, lineId, status: 'upcoming', tagline: ' ' } });
    expect(missing.status).toBe(409);
    expect((await sql`select status from products where id=${productId}`)[0].status).toBe('draft');
    const updated = await api(`/api/admin/products/${productId}`, { cookie: admin, body: { ...details, lineId, status: 'upcoming' } });
    expect(updated.status).toBe(200);
    const [row] = await sql`select status,active,launch_at from products where id=${productId}`;
    expect(row.status).toBe('upcoming'); expect(row.active).toBe(false);
    expect(new Date(row.launch_at).toISOString()).toBe('2027-01-20T20:00:00.000Z');
    for (const path of ['/', '/tienda', `/producto/${slug}`]) {
      const page = await api(path); expect(page.status, path).toBe(200); expect(page.text, path).toContain(details.name);
    }
    const page = await api(`/producto/${slug}`);
    expect(page.text).toContain('PRÓXIMAMENTE'); expect(page.text).not.toContain('add-to-cart');
    expect((await api(`/api/catalog/products/${slug}`)).json.profile.tagline).toBe(details.tagline);
  });
  it('rechaza entrega repetida, conserva slug al editar y revierte transiciones inválidas', async () => {
    expect((await api('/api/admin/products', { cookie: admin, body: { ...details, lineId } })).status).toBe(409);
    const renamed = { ...details, name: 'QA Nuevo Pipeline editado', lineId, status: 'upcoming' };
    expect((await api(`/api/admin/products/${productId}`, { cookie: operator, body: renamed })).status).toBe(403);
    expect((await api(`/api/admin/products/${productId}`, { cookie: admin, body: renamed })).status).toBe(200);
    expect((await sql`select slug from products where id=${productId}`)[0].slug).toBe(slug);
    const activation = await api(`/api/admin/products/${productId}`, { cookie: admin, body: { ...renamed, status: 'active', name: 'No guardar' } });
    expect(activation.status).toBe(409);
    expect((await sql`select name,status from products where id=${productId}`)[0]).toEqual({ name: renamed.name, status: 'upcoming' });
    expect((await api(`/api/admin/products/${productId}/status`, { cookie: admin, body: { status: 'draft' } })).status).toBe(200);
    expect((await api(`/api/admin/products/${productId}/status`, { cookie: admin, body: { status: 'discontinued' } })).status).toBe(409);
    expect((await api(`/producto/${slug}`)).status).toBe(404);
  });
});
