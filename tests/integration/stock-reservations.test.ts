import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { api, customer, db } from './helpers';

// S3.2: el pedido reserva el stock al crearse (ADR 0005). Prueba contra el servidor real y PostgreSQL.
const SKU = 'espresso-250';
const line = (quantity: number) => ({ sku: SKU, grind: 'Grano entero', quantity });
const order = (quantity: number) => api('/api/orders', { body: { items: [line(quantity)], customer, acceptedPolicies: true } });

const sql = db();
afterAll(() => sql.end());

async function stockOf() {
  const [row] = await sql`select id, stock from product_variants where sku = ${SKU}`;
  return { id: row.id as number, stock: row.stock as number };
}
const setStock = (stock: number) => sql`update product_variants set stock = ${stock} where sku = ${SKU}`;
const reservations = async (variantId: number) =>
  sql`select order_id, quantity, expires_at, released_at from stock_reservations where variant_id = ${variantId} order by id`;

describe('reserva de stock al crear el pedido', () => {
  beforeEach(async () => {
    const { id } = await stockOf();
    await sql`delete from stock_reservations where variant_id = ${id}`;
    await setStock(5);
  });

  afterAll(async () => {
    const { id } = await stockOf();
    await sql`delete from stock_reservations where variant_id = ${id}`;
    await setStock(50);
  });

  it('crear el pedido reserva las unidades por 30 minutos y no cambia el stock físico', async () => {
    const created = await order(2);
    expect(created.status).toBe(201);
    const { id, stock } = await stockOf();
    expect(stock).toBe(5);
    const rows = await reservations(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ order_id: created.json.id, quantity: 2, released_at: null });
    const minutes = (new Date(rows[0].expires_at).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(28);
    expect(minutes).toBeLessThanOrEqual(30);
  });

  it('la cotización y el siguiente pedido ven lo disponible: físico menos reservado', async () => {
    expect((await order(4)).status).toBe(201);
    const quote = await api('/api/cart/quote', { body: { items: [line(2)] } });
    expect(quote.json.issues).toEqual([{ sku: SKU, message: 'Solo queda 1 unidad de Espresso Amazonas 250 g.' }]);
    expect((await order(1)).status).toBe(201);
  });

  it('dos pedidos simultáneos del último ítem: uno se crea y el otro falla con un mensaje claro', async () => {
    await setStock(1);
    const results = await Promise.all([order(1), order(1)]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const failed = results.find(result => result.status === 409)!;
    expect(failed.json.issues).toEqual([{ sku: SKU, message: 'Espresso Amazonas 250 g está agotado por ahora.' }]);

    const { id, stock } = await stockOf();
    expect(stock).toBe(1);
    const rows = await reservations(id);
    expect(rows).toHaveLength(1);
    const [{ count }] = await sql`select count(*)::int as count from orders where id = ${results.find(result => result.status === 201)!.json.id}`;
    expect(count).toBe(1);
  });

  it('muchos pedidos a la vez nunca reservan más de lo que hay', async () => {
    await setStock(3);
    const results = await Promise.all(Array.from({ length: 8 }, () => order(1)));
    expect(results.filter(result => result.status === 201)).toHaveLength(3);
    expect(results.filter(result => result.status === 409)).toHaveLength(5);
    const { id } = await stockOf();
    expect((await reservations(id)).reduce((sum, row) => sum + Number(row.quantity), 0)).toBe(3);
  });

  it('una reserva vencida no cuenta: la disponibilidad no depende de ningún cron', async () => {
    await setStock(1);
    expect((await order(1)).status).toBe(201);
    expect((await order(1)).status).toBe(409);
    const { id } = await stockOf();
    await sql`update stock_reservations set expires_at = now() - interval '1 minute' where variant_id = ${id}`;
    expect((await order(1)).status).toBe(201);
  });

  it('una reserva liberada tampoco cuenta', async () => {
    await setStock(1);
    expect((await order(1)).status).toBe(201);
    const { id } = await stockOf();
    await sql`update stock_reservations set released_at = now() where variant_id = ${id}`;
    expect((await order(1)).status).toBe(201);
  });

  it('ajustar las líneas del pedido rehace su reserva y no compite contra la propia', async () => {
    await setStock(3);
    const created = await order(3);
    expect(created.status).toBe(201);
    const { id } = await stockOf();
    const before = (await reservations(id))[0].expires_at;

    const adjusted = await api(`/api/orders/${created.json.id}/items`, { body: { items: [line(2)] } });
    expect(adjusted.status).toBe(200);
    const rows = await reservations(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quantity: 2 });
    expect(new Date(rows[0].expires_at).getTime()).toBe(new Date(before).getTime());
    // La unidad que sobró queda libre para otro cliente.
    expect((await order(1)).status).toBe(201);
    expect((await order(1)).status).toBe(409);
  });
});
