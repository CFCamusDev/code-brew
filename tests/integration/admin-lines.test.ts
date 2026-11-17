import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, OPERATOR, api, db, login } from './helpers';

const sql = db();
const input = { name: 'Línea QA admin', slug: 'qa-admin-linea', description: 'Colección de prueba', theme: { '--cb-cream': '#fff' }, template: 'base', sortOrder: 10000 };
let admin: string;
let operator: string;
let id: number;
async function cleanup() {
  await sql`delete from products where slug = 'qa-admin-linea-producto'`;
  await sql`delete from product_lines where slug in ('qa-admin-linea', 'qa-admin-segunda', 'qa-admin-renombrada')`;
}
beforeAll(async () => { await cleanup(); admin = await login(ADMIN); operator = await login(OPERATOR); });
afterAll(async () => { await cleanup(); await sql.end(); });
describe('administración de líneas por HTTP', () => {
  it('exige sesión y permite al operador consultar el panel', async () => {
    expect((await api('/api/admin/lines')).status).toBe(401);
    expect((await api('/admin/lineas', { cookie: operator })).status).toBe(200);
    expect((await api('/api/admin/lines', { cookie: operator })).status).toBe(200);
  });
  it('crea un borrador con identidad visual y evita slugs duplicados', async () => {
    const created = await api('/api/admin/lines', { cookie: admin, body: input });
    expect(created.status).toBe(201);
    id = created.json.line.id;
    expect(created.json.line).toMatchObject({ ...input, status: 'draft' });
    expect((await api('/api/admin/lines', { cookie: admin, body: input })).status).toBe(409);
  });
  it('permite renombrar un borrador', async () => {
    for (const slug of ['qa-admin-renombrada', input.slug]) {
      expect((await api(`/api/admin/lines/${id}`, { cookie: admin, method: 'PUT', body: { ...input, slug } })).status).toBe(200);
    }
  });
  it('impide al operador crear, editar, activar y archivar', async () => {
    expect((await api('/api/admin/lines', { cookie: operator, body: input })).status).toBe(403);
    for (const [method, body] of [['PUT', input], ['PATCH', { action: 'activate' }], ['PATCH', { action: 'archive' }]] as const) {
      expect((await api(`/api/admin/lines/${id}`, { cookie: operator, method, body })).status).toBe(403);
    }
  });
  it('valida entradas y no deja saltarse el ciclo de vida por edición', async () => {
    for (const change of [{ theme: { '--x': 'url(evil)' } }, { template: 'desconocida' }, { sortOrder: -1 }, { status: 'active' }]) {
      expect((await api(`/api/admin/lines/${id}`, { cookie: admin, method: 'PUT', body: { ...input, ...change } })).status).toBe(400);
    }
    expect((await api('/api/admin/lines/no-numero', { cookie: admin, method: 'PUT', body: input })).status).toBe(400);
    expect((await api('/api/admin/lines/2147483647', { cookie: admin, method: 'PUT', body: input })).status).toBe(404);
  });
  it('no activa una línea vacía y publica con producto próximo', async () => {
    expect((await api(`/api/admin/lines/${id}`, { cookie: admin, method: 'PATCH', body: { action: 'activate' } })).status).toBe(409);
    await sql`insert into products (slug, name, roast, grinds, line_id, status, active) values ('qa-admin-linea-producto', 'QA Próximo', 'Medio', '[]', ${id}, 'upcoming', false)`;
    expect((await api(`/api/admin/lines/${id}`, { cookie: admin, method: 'PATCH', body: { action: 'activate' } })).status).toBe(200);
  });
  it('rechaza cambiar el slug activo sin guardar otros campos', async () => {
    const response = await api(`/api/admin/lines/${id}`, { cookie: admin, method: 'PUT', body: { ...input, slug: 'qa-admin-renombrada', name: 'No guardar' } });
    expect(response.status).toBe(409);
    expect(response.json.error).toContain('borrador');
    expect((await sql`select slug,name from product_lines where id=${id}`)[0]).toEqual({ slug: input.slug, name: input.name });
  });
  it('edita sin cambiar estado, ordena y conserva tema y plantilla', async () => {
    const second = await api('/api/admin/lines', { cookie: admin, body: { ...input, slug: 'qa-admin-segunda', sortOrder: 9999 } });
    expect(second.status).toBe(201);
    const updated = await api(`/api/admin/lines/${id}`, { cookie: admin, method: 'PUT', body: { ...input, sortOrder: 9998 } });
    expect(updated.json.line).toMatchObject({ status: 'active', sortOrder: 9998, theme: input.theme });
    const listed = await api('/api/admin/lines', { cookie: admin });
    const ids = listed.json.lines.map((line: { id: number }) => line.id);
    expect(ids.indexOf(id)).toBeLessThan(ids.indexOf(second.json.line.id));
  });
  it('archiva, oculta sin borrar productos y permite reactivar', async () => {
    expect((await api(`/api/admin/lines/${id}`, { cookie: admin, method: 'PATCH', body: { action: 'archive' } })).status).toBe(200);
    expect((await api(`/api/admin/lines/${id}`, { cookie: admin, method: 'PUT', body: { ...input, slug: 'qa-admin-renombrada' } })).status).toBe(409);
    expect((await api('/api/catalog/lines/qa-admin-linea')).status).toBe(404);
    expect((await sql`select status from products where line_id = ${id}`)[0].status).toBe('upcoming');
    expect((await api(`/api/admin/lines/${id}`, { cookie: admin, method: 'PATCH', body: { action: 'activate' } })).status).toBe(200);
  });
  it('protege el slug pipeline y conserva su portada y endpoint', async () => {
    const [line] = await sql`select * from product_lines where slug='pipeline'`;
    const response = await api(`/api/admin/lines/${line.id}`, { cookie: admin, method: 'PUT', body: { ...input, slug: 'pipeline-renombrada' } });
    expect(response.status).toBe(409);
    expect((await api('/api/catalog/lines/pipeline')).status).toBe(200);
    expect((await api('/')).text).toContain('id="pipeline"');
  });
  // S5.6 (#105 / PR #170) aporta /tienda. Esta prueba se activa al integrar esa ruta.
  it.skipIf(!existsSync(new URL('../../src/pages/tienda.astro', import.meta.url)))('muestra y oculta la línea en tienda según su estado', async () => {
    expect((await api('/tienda')).status).toBe(200);
    expect((await api('/tienda')).text).toContain(input.name);
    expect((await api(`/api/admin/lines/${id}`, { cookie: admin, method: 'PATCH', body: { action: 'archive' } })).status).toBe(200);
    expect((await api('/tienda')).text).not.toContain(input.name);
    expect((await api(`/api/admin/lines/${id}`, { cookie: admin, method: 'PATCH', body: { action: 'activate' } })).status).toBe(200);
    expect((await api('/tienda')).text).toContain(input.name);
  });

});
