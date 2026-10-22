// Carga el catálogo inicial desde src/data/catalog.json.
// Solo inserta perfiles y presentaciones que aún no existen: no pisa precios ni stock editados desde el admin.
import { existsSync } from 'node:fs';
import postgres from 'postgres';
import catalog from '../../src/data/catalog.json' with { type: 'json' };

if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let insertedProducts = 0;
let insertedVariants = 0;

try {
  await sql.begin(async tx => {
    for (const [index, product] of catalog.products.entries()) {
      const inserted = await tx`
        insert into products (slug, name, roast, grinds, sort_order)
        values (${product.slug}, ${product.name}, ${product.roast}, ${tx.json(product.grinds)}, ${index})
        on conflict (slug) do nothing
        returning id`;
      insertedProducts += inserted.length;
      const [{ id: productId }] = await tx`select id from products where slug = ${product.slug}`;

      for (const variant of product.variants) {
        const insertedVariant = await tx`
          insert into product_variants (product_id, sku, format, price_cents)
          values (${productId}, ${variant.sku}, ${variant.format}, ${Math.round(variant.price * 100)})
          on conflict (sku) do nothing
          returning id`;
        insertedVariants += insertedVariant.length;
      }
    }
  });
  console.log(`[db] seed: ${insertedProducts} perfiles y ${insertedVariants} presentaciones nuevas`);
} finally {
  await sql.end();
}
