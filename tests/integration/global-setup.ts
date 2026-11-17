import { hashPassword } from '../../scripts/lib/password.mjs';
import { ADMIN, BASE_URL, db, OPERATOR } from './helpers';

/**
 * Productos solo de prueba. El catálogo real es Pipeline (S2.5), con un único café a la venta; las pruebas de stock,
 * packs y varios productos en un pedido necesitan más variantes, así que se crean aquí con los SKU de siempre.
 */
const FIXTURES = [
  { slug: 'espresso', name: 'Espresso Amazonas', grinds: ['Grano entero', 'Molido para espresso'], variants: [['espresso-250', '250 g', 3400, 1], ['espresso-500', '500 g', 6000, 1]] },
  { slug: 'developer', name: 'Pack Developer', grinds: ['Combinación por coordinar', 'Ambos en grano', 'Ambos molidos'], variants: [['pack-developer', '2 × 250 g', 6200, 2]] },
  { slug: 'microlote', name: 'Microlote de Temporada', grinds: ['Grano entero', 'Molido para filtrado'], variants: [['microlote-temporada', '250 g', 4500, 1]] }
] as const;

/** Deja la base en un estado conocido: usuarios de prueba, productos de prueba, stock, precios y tarifas. */
export default async function setup() {
  const health = await fetch(`${BASE_URL}/api/health`).catch(() => null);
  if (!health?.ok) throw new Error(`El servidor no responde en ${BASE_URL}. Levántalo antes de correr las pruebas de integración.`);

  const sql = db();
  try {
    for (const [user, role, name] of [
      [ADMIN, 'admin', 'Admin CI'],
      [OPERATOR, 'operator', 'Operador CI']
    ] as const) {
      await sql`
        insert into admin_users (email, name, password_hash, role)
        values (${user.email}, ${name}, ${await hashPassword(user.password)}, ${role})
        on conflict (email) do update set password_hash = excluded.password_hash, role = excluded.role, active = true`;
    }
    for (const [index, fixture] of FIXTURES.entries()) {
      const [{ id }] = await sql`
        insert into products (slug, name, roast, grinds, sort_order)
        values (${fixture.slug}, ${fixture.name}, 'Tueste medio', ${sql.json([...fixture.grinds])}, ${100 + index})
        on conflict (slug) do update set name = excluded.name, grinds = excluded.grinds, status = null
        returning id`;
      for (const [sku, format, priceCents, bags] of fixture.variants) {
        await sql`
          insert into product_variants (product_id, sku, format, price_cents, bags)
          values (${id}, ${sku}, ${format}, ${priceCents}, ${bags})
          on conflict (sku) do update set product_id = excluded.product_id`;
      }
    }
    await sql`update product_variants set stock = 50, active = true`;
    await sql`update product_variants set stock = 1 where sku = 'microlote-temporada'`;
    await sql`update product_variants set price_cents = 3400 where sku in ('hotfix-250', 'espresso-250')`;
    // Los perfiles próximos de Pipeline siguen sin venta.
    await sql`update products set active = true where status is null or status = 'active'`;
    await sql`delete from shipping_region_rates where region = 'Loreto'`;
  } finally {
    await sql.end();
  }
}
