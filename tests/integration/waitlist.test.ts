import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, BASE_URL, db } from './helpers';

const sql = db();
const email = 'qa-waitlist@example.test';
const input = { email, productSlug: 'qa-waitlist-proximo', consent: true };
let lineId: number;
let productId: number;
async function cleanup() {
  await sql`delete from products where slug like 'qa-waitlist-%'`;
  await sql`delete from product_lines where slug='qa-waitlist-line'`;
}
beforeAll(async () => {
  await cleanup();
  [{ id: lineId }] = await sql`insert into product_lines(slug,name,status) values ('qa-waitlist-line','QA interesados','active') returning id`;
  [{ id: productId }] = await sql`insert into products(slug,name,roast,grinds,line_id,status,active) values ('qa-waitlist-proximo','QA Próximo','Medio','[]',${lineId},'upcoming',false) returning id`;
});
afterAll(async () => { await cleanup(); await sql.end(); });
describe('lista de interesados por HTTP y PostgreSQL', () => {
  it('rechaza consentimiento ausente, falso y texto, además de datos inválidos', async () => {
    for (const change of [{ consent: false }, { consent: undefined }, { consent: 'true' }, { email: 'sin-correo' }, { productSlug: '../draft' }]) {
      expect((await api('/api/waitlist', { body: { ...input, ...change } })).status).toBe(400);
    }
    expect((await sql`select id from waitlist_subscriptions where product_id=${productId}`)).toHaveLength(0);
  });
  it('normaliza y no duplica incluso con solicitudes simultáneas', async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, (_, i) => api('/api/waitlist', { body: { ...input, email: i % 2 ? '  QA-WAITLIST@EXAMPLE.TEST  ' : email } })));
    expect(responses.map(response => response.status)).toEqual([200,200,200,200,200]);
    expect(responses.every(response => JSON.stringify(response.json) === JSON.stringify(responses[0].json))).toBe(true);
    expect(responses[0].headers.get('cache-control')).toBe('no-store');
    expect(responses[0].text).not.toContain(email);
    const rows = await sql`select email,consent,created_at,notified_at from waitlist_subscriptions where product_id=${productId}`;
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ email, consent: true, notified_at: null });
    expect(rows[0].created_at).toBeTruthy();
  });
  it('un reintento conserva created_at y notified_at', async () => {
    await sql`update waitlist_subscriptions set notified_at='2026-11-17T15:00:00Z' where product_id=${productId}`;
    const [before] = await sql`select created_at,notified_at from waitlist_subscriptions where product_id=${productId}`;
    expect((await api('/api/waitlist', { body: input })).status).toBe(200);
    expect((await sql`select created_at,notified_at from waitlist_subscriptions where product_id=${productId}`)[0]).toEqual(before);
  });
  it('el mismo correo puede interesarse por otro producto y la BD exige consentimiento y normalización', async () => {
    const [other] = await sql`insert into products(slug,name,roast,grinds,line_id,status,active) values ('qa-waitlist-otro','QA Otro','Medio','[]',${lineId},'upcoming',false) returning id`;
    expect((await api('/api/waitlist', { body: { ...input, productSlug: 'qa-waitlist-otro' } })).status).toBe(200);
    expect((await sql`select id from waitlist_subscriptions where email=${email}`)).toHaveLength(2);
    await expect(sql`insert into waitlist_subscriptions(email,product_id,consent) values ('qa-noconsent@example.test',${other.id},false)`).rejects.toMatchObject({ code: '23514' });
    await expect(sql`insert into waitlist_subscriptions(email,product_id,consent) values ('QA-UPPER@EXAMPLE.TEST',${other.id},true)`).rejects.toMatchObject({ code: '23514' });
  });
  it('no revela ni suscribe productos inexistentes o no publicados', async () => {
    const absent = await api('/api/waitlist', { body: { ...input, productSlug: 'qa-waitlist-inexistente' } });
    expect(absent.status).toBe(404);
    for (const status of ['draft', 'active', 'discontinued'] as const) {
      await sql`update products set status=${status} where id=${productId}`;
      const response = await api('/api/waitlist', { body: input });
      expect(response.status).toBe(404); expect(response.json).toEqual(absent.json);
    }
    await sql`update products set status='upcoming' where id=${productId}`;
    await sql`update product_lines set status='archived' where id=${lineId}`;
    expect((await api('/api/waitlist', { body: input })).status).toBe(404);
    await sql`update product_lines set status='active' where id=${lineId}`;
    expect((await sql`select id from waitlist_subscriptions where product_id=${productId}`)).toHaveLength(1);
  });
  it('valida el transporte y limita solicitudes grandes', async () => {
    const wrong = await fetch(`${BASE_URL}/api/waitlist`, { method: 'POST', headers: { 'content-type': 'text/plain', 'cf-connecting-ip': '198.51.100.201' }, body: JSON.stringify(input) });
    expect(wrong.status).toBe(415);
    const malformed = await fetch(`${BASE_URL}/api/waitlist`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.201' }, body: '{' });
    expect(malformed.status).toBe(400);
    expect((await api('/api/waitlist', { body: { ...input, email: 'a'.repeat(5000) }, headers: { 'cf-connecting-ip': '198.51.100.201' } })).status).toBe(413);
    const streamed = await fetch(`${BASE_URL}/api/waitlist`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.201' },
      body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ ...input, email: 'a'.repeat(5000) }))); controller.close(); } }),
      duplex: 'half'
    } as RequestInit & { duplex: 'half' });
    expect(streamed.status).toBe(413);
    expect((await api('/api/waitlist')).status).toBe(405);
  });
  it('responde 429 con Retry-After sin insertar al exceder intentos', async () => {
    const headers = { 'cf-connecting-ip': '198.51.100.202' };
    for (let i = 0; i < 20; i++) expect((await api('/api/waitlist', { body: { ...input, consent: false }, headers })).status).toBe(400);
    const limited = await api('/api/waitlist', { body: input, headers });
    expect(limited.status).toBe(429); expect(limited.headers.get('retry-after')).toBe('900');
    expect(limited.headers.get('cache-control')).toBe('no-store');
    expect((await sql`select id from waitlist_subscriptions where product_id=${productId}`)).toHaveLength(1);
  });
});
