import { hashPassword } from '../../scripts/lib/password.mjs';
import { ADMIN, BASE_URL, db, OPERATOR } from './helpers';

/** Deja la base en un estado conocido: usuarios de prueba, stock, precios y tarifas del catálogo. */
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
    await sql`update product_variants set stock = 50, active = true`;
    await sql`update product_variants set stock = 1 where sku = 'microlote-temporada'`;
    await sql`update product_variants set price_cents = 3400 where sku in ('monteverde-250', 'espresso-250')`;
    await sql`update products set active = true`;
    await sql`delete from shipping_region_rates where region = 'Loreto'`;
  } finally {
    await sql.end();
  }
}
