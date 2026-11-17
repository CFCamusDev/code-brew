import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, OPERATOR, api, db, login } from './helpers';

const sql = db();
let id: number;
let admin: string;
let operator: string;
const details = { name: 'QA Publicación', roast: 'Medio', grinds: ['Grano entero'], imageUrl: null };
const activate = (cookie = admin) => api(`/api/admin/products/${id}/status`, { cookie, body: { status: 'active' } });
async function cleanup() {
  await sql`delete from product_variants where sku='qa-publication-250'`;
  await sql`delete from products where slug='qa-publicacion'`;
  await sql`delete from product_lines where slug='qa-publication-line'`;
}
beforeAll(async () => { await cleanup(); admin = await login(ADMIN); operator = await login(OPERATOR); });
afterAll(async () => { await cleanup(); await sql.end(); });
describe('publicación desde el panel', () => {
  it('crea sin habilitar la venta y exige sesión y rol admin', async () => {
    const created = await api('/api/admin/products', { cookie: admin, body: details });
    expect(created.status).toBe(201);
    id = created.json.id;
    expect((await sql`select active,status from products where id=${id}`)[0]).toEqual({ active: false, status: 'draft' });
    expect((await activate('')).status).toBe(401);
    expect((await activate(operator)).status).toBe(403);
    expect((await api('/api/admin/products/no-id/status', { cookie: admin, body: { status: 'active' } })).status).toBe(400);
    expect((await api('/api/admin/products/2147483647/status', { cookie: admin, body: { status: 'active' } })).status).toBe(404);
  });
  it('devuelve todos los faltantes con códigos y mensajes y mantiene el borrador', async () => {
    const response = await activate();
    expect(response.status).toBe(409);
    expect(response.json.issues.map((issue: { code: string }) => issue.code)).toEqual(['missing_line','missing_tagline','missing_method','missing_description','missing_image','missing_active_variant']);
    expect(response.json.issues.every((issue: { message: string }) => issue.message.length > 5)).toBe(true);
    expect((await sql`select active,status from products where id=${id}`)[0]).toEqual({ active: false, status: 'draft' });
  });
  it('la edición antigua no permite activar y revierte los cambios si falla', async () => {
    const response = await api(`/api/admin/products/${id}`, { cookie: admin, body: { ...details, name: 'No debe guardarse', active: true } });
    expect(response.status).toBe(409);
    expect(response.json.issues).toBeInstanceOf(Array);
    expect((await sql`select name,active from products where id=${id}`)[0]).toEqual({ name: details.name, active: false });
  });
  it('exige frente como imagen principal y precio para todas las presentaciones activas', async () => {
    const [line] = await sql`insert into product_lines(slug,name,status) values ('qa-publication-line','QA','active') returning id`;
    await sql`update products set line_id=${line.id} where id=${id}`;
    await sql`insert into product_profiles(product_id,tagline,method,description) values (${id},'Frase','Espresso','Descripción')`;
    await sql`insert into product_media(product_id,view,url,alt) values (${id},'back','/qa/back.webp','Reverso')`;
    await sql`insert into product_variants(product_id,sku,format,price_cents,stock,active) values (${id},'qa-publication-250','250 g',0,5,true)`;
    expect((await activate()).json.issues.map((issue: { code: string }) => issue.code)).toEqual(['missing_image','missing_price']);
    await sql`insert into product_media(product_id,view,url,alt) values (${id},'front','/qa/front.webp','Frente')`;
    expect((await activate()).json.issues.map((issue: { code: string }) => issue.code)).toEqual(['missing_price']);
    await sql`update product_variants set price_cents=3400 where product_id=${id}`;
    expect((await activate()).status).toBe(200);
    const [product] = await sql`select status,active,launch_at from products where id=${id}`;
    expect(product).toMatchObject({ status: 'active', active: true });
    expect(product.launch_at).toBeTruthy();
    expect((await api('/api/catalog/products/qa-publicacion')).status).toBe(200);
  });
  it('reintenta sin cambiar la fecha, valida ediciones activas y permite descontinuar', async () => {
    const [before] = await sql`select launch_at from products where id=${id}`;
    expect((await activate()).status).toBe(200);
    expect((await sql`select launch_at from products where id=${id}`)[0].launch_at).toEqual(before.launch_at);
    await sql`delete from product_media where product_id=${id}`;
    const edited = await api(`/api/admin/products/${id}`, { cookie: admin, body: { ...details, active: true } });
    expect(edited.status).toBe(409);
    expect(edited.json.issues.map((issue: { code: string }) => issue.code)).toContain('missing_image');
    expect((await api(`/api/admin/products/${id}/status`, { cookie: admin, body: { status: 'discontinued' } })).status).toBe(200);
    expect((await sql`select status,active from products where id=${id}`)[0]).toEqual({ status: 'discontinued', active: false });
  });
});
