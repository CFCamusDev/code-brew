// Carga el catálogo y las zonas de envío iniciales desde src/data/catalog.json y src/data/shipping.json.
// Solo inserta lo que aún no existe: no pisa precios, tarifas ni stock editados desde el admin.
import { existsSync } from 'node:fs';
import postgres from 'postgres';
import catalog from '../../src/data/catalog.json' with { type: 'json' };
import shipping from '../../src/data/shipping.json' with { type: 'json' };

if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let insertedProducts = 0;
let insertedVariants = 0;
let insertedZones = 0;

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
          insert into product_variants (product_id, sku, format, price_cents, bags)
          values (${productId}, ${variant.sku}, ${variant.format}, ${Math.round(variant.price * 100)}, ${variant.bags ?? 1})
          on conflict (sku) do nothing
          returning id`;
        insertedVariants += insertedVariant.length;
      }
    }

    for (const [index, zone] of shipping.zones.entries()) {
      const inserted = await tx`
        insert into shipping_zones (slug, name, eta, price_cents, free_from_bags, regions, sort_order)
        values (${zone.slug}, ${zone.name}, ${zone.eta}, ${Math.round(zone.price * 100)}, ${zone.freeBags ?? null}, ${zone.regions ? tx.json(zone.regions) : null}, ${index})
        on conflict (slug) do nothing
        returning id`;
      insertedZones += inserted.length;
      const [{ id: zoneId }] = await tx`select id from shipping_zones where slug = ${zone.slug}`;

      for (const [region, price] of Object.entries(zone.regionRates ?? {})) {
        await tx`
          insert into shipping_region_rates (zone_id, region, price_cents)
          values (${zoneId}, ${region}, ${Math.round(price * 100)})
          on conflict (zone_id, region) do nothing`;
      }
    }
  });
  console.log(`[db] seed: ${insertedProducts} perfiles, ${insertedVariants} presentaciones y ${insertedZones} zonas de envío nuevas`);
} finally {
  await sql.end();
}
