// Carga el catálogo y las zonas de envío iniciales desde src/data/catalog.json y src/data/shipping.json, y la línea
// Pipeline con sus cinco perfiles desde src/data/pipeline.json (ADR 0003, S2.5).
// Solo inserta lo que aún no existe: no pisa precios, tarifas, stock ni estados editados desde el admin. Corre en cada
// arranque del contenedor, así que todo paso debe poder repetirse sin efecto.
import { existsSync } from 'node:fs';
import postgres from 'postgres';
import catalog from '../../src/data/catalog.json' with { type: 'json' };
import pipeline from '../../src/data/pipeline.json' with { type: 'json' };
import shipping from '../../src/data/shipping.json' with { type: 'json' };
import settings from '../../src/data/settings.json' with { type: 'json' };

if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL');

// Slug y SKU de antes de la línea Pipeline: Hotfix nació como «monteverde». Los pedidos guardan el id de la variante,
// así que renombrar no altera el historial.
const RENAMED_PRODUCTS = [['monteverde', 'hotfix']];
const RENAMED_VARIANTS = [
  ['monteverde-250', 'hotfix-250'],
  ['monteverde-500', 'hotfix-500']
];
// Catálogo anterior que ya no forma parte del negocio (ADR 0003). Se borra si nada lo referencia; si tiene pedidos o
// es componente de un pack, se descontinúa para no romper el historial ni el arranque.
const RETIRED_PRODUCTS = ['espresso', 'developer', 'microlote'];

const PIPELINE_LINE = {
  slug: 'pipeline',
  name: 'Pipeline',
  description: 'Cinco perfiles de café de especialidad, uno para cada etapa del desarrollo.',
  template: 'pipeline'
};
// Lo que hoy muestran las páginas de los perfiles «próximamente».
const UPCOMING_REVEALED = ['tagline', 'method', 'recipe'];
const HOTFIX_MEDIA = [
  ['front', 'frente'],
  ['back', 'reverso'],
  ['left', 'lateral izquierdo'],
  ['right', 'lateral derecho']
];

const entries = pairs => pairs.map(([label, value]) => ({ label: String(label), value: String(value) }));

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const counts = { products: 0, variants: 0, zones: 0, settings: 0, renamed: 0, deleted: 0, discontinued: 0, profiles: 0, media: 0 };

try {
  await sql.begin(async tx => {
    // 1. Renombrar al slug y SKU de la marca, solo si el nombre nuevo aún no existe.
    for (const [from, to] of RENAMED_PRODUCTS) {
      const renamed = await tx`
        update products set slug = ${to}
        where slug = ${from} and not exists (select 1 from products where slug = ${to})
        returning id`;
      counts.renamed += renamed.length;
    }
    for (const [from, to] of RENAMED_VARIANTS) {
      const renamed = await tx`
        update product_variants set sku = ${to}
        where sku = ${from} and not exists (select 1 from product_variants where sku = ${to})
        returning id`;
      counts.renamed += renamed.length;
    }

    // 2. Catálogo comercial (precios y presentaciones).
    for (const [index, product] of catalog.products.entries()) {
      const inserted = await tx`
        insert into products (slug, name, roast, grinds, sort_order)
        values (${product.slug}, ${product.name}, ${product.roast}, ${tx.json(product.grinds)}, ${index})
        on conflict (slug) do nothing
        returning id`;
      counts.products += inserted.length;
      const [{ id: productId }] = await tx`select id from products where slug = ${product.slug}`;

      for (const variant of product.variants) {
        const insertedVariant = await tx`
          insert into product_variants (product_id, sku, format, price_cents, bags)
          values (${productId}, ${variant.sku}, ${variant.format}, ${Math.round(variant.price * 100)}, ${variant.bags ?? 1})
          on conflict (sku) do nothing
          returning id`;
        counts.variants += insertedVariant.length;
      }
    }

    // 3. Retirar el catálogo anterior.
    for (const slug of RETIRED_PRODUCTS) {
      const [product] = await tx`select id, status from products where slug = ${slug}`;
      if (!product) continue;
      const [{ used }] = await tx`
        select exists (
          select 1 from order_items i join product_variants v on v.id = i.variant_id where v.product_id = ${product.id}
        ) or exists (
          select 1 from bundle_items b join product_variants v on v.id = b.component_variant_id where v.product_id = ${product.id}
        ) as used`;
      if (!used) {
        await tx`delete from product_variants where product_id = ${product.id}`;
        await tx`delete from products where id = ${product.id}`;
        counts.deleted++;
      } else if (product.status !== 'discontinued') {
        await tx`update product_variants set active = false where product_id = ${product.id}`;
        await tx`update products set active = false, status = 'discontinued' where id = ${product.id}`;
        counts.discontinued++;
      }
    }

    // 4. Línea Pipeline y sus cinco perfiles, con su contenido editorial.
    await tx`
      insert into product_lines (slug, name, description, status, template, sort_order)
      values (${PIPELINE_LINE.slug}, ${PIPELINE_LINE.name}, ${PIPELINE_LINE.description}, 'active', ${PIPELINE_LINE.template}, 0)
      on conflict (slug) do nothing`;
    const [{ id: lineId }] = await tx`select id from product_lines where slug = ${PIPELINE_LINE.slug}`;

    for (const [index, profile] of pipeline.entries()) {
      const onSale = profile.status === 'available';
      const status = onSale ? 'active' : 'upcoming';
      // Los perfiles próximos no tienen presentaciones todavía: se crean sin venta.
      const inserted = await tx`
        insert into products (slug, name, roast, grinds, sort_order, active)
        values (${profile.catalogSlug}, ${profile.name}, ${profile.roast}, ${tx.json([])}, ${index}, ${onSale})
        on conflict (slug) do nothing
        returning id`;
      counts.products += inserted.length;
      // Solo completa lo que falta: un estado o línea cambiados desde el panel se respetan.
      const [{ id: productId }] = await tx`
        update products set
          line_id = coalesce(line_id, ${lineId}),
          release_number = coalesce(release_number, ${Number(profile.num)}),
          status = coalesce(status, ${status}::product_status),
          launch_at = coalesce(launch_at, case when ${onSale} then now() end)
        where slug = ${profile.catalogSlug}
        returning id`;

      const insertedProfile = await tx`
        insert into product_profiles (product_id, tagline, method, description, notes, facts, cup_profile, recipe_for, recipe, colors, revealed_fields)
        values (
          ${productId}, ${profile.tagline}, ${profile.method}, ${profile.description}, ${tx.json(profile.notes)},
          ${tx.json(entries(profile.facts))},
          ${tx.json(profile.profile.map(([attribute, level]) => ({ attribute: String(attribute), level: Number(level) })))},
          ${profile.recipeFor}, ${tx.json(entries(profile.recipe))},
          ${tx.json({ color: profile.color, tint: profile.tint, glow: profile.glow })},
          ${tx.json(onSale ? [] : UPCOMING_REVEALED)}
        )
        on conflict (product_id) do nothing
        returning product_id`;
      counts.profiles += insertedProfile.length;

      if (profile.slug === 'hotfix') {
        for (const [sortOrder, [view, label]] of HOTFIX_MEDIA.entries()) {
          const insertedMedia = await tx`
            insert into product_media (product_id, view, url, alt, sort_order)
            values (${productId}, ${view}, ${`/assets/brand/hotfix-stable-${view}.webp`}, ${`Bolsa CodeBrew Hotfix, ${label}`}, ${sortOrder})
            on conflict (product_id, view) do nothing
            returning id`;
          counts.media += insertedMedia.length;
        }
      }
    }

    // 5. Zonas de envío y ajustes del sitio.
    for (const [index, zone] of shipping.zones.entries()) {
      const inserted = await tx`
        insert into shipping_zones (slug, name, eta, price_cents, free_from_bags, regions, sort_order)
        values (${zone.slug}, ${zone.name}, ${zone.eta}, ${Math.round(zone.price * 100)}, ${zone.freeBags ?? null}, ${zone.regions ? tx.json(zone.regions) : null}, ${index})
        on conflict (slug) do nothing
        returning id`;
      counts.zones += inserted.length;
      const [{ id: zoneId }] = await tx`select id from shipping_zones where slug = ${zone.slug}`;

      for (const [region, price] of Object.entries(zone.regionRates ?? {})) {
        await tx`
          insert into shipping_region_rates (zone_id, region, price_cents)
          values (${zoneId}, ${region}, ${Math.round(price * 100)})
          on conflict (zone_id, region) do nothing`;
      }
    }

    const settingRows = [
      ['social_links', settings.socialLinks],
      ['policy_terms', settings.policies.terminos],
      ['policy_privacy', settings.policies.privacidad],
      ['policy_shipping_returns', settings.policies['envios-devoluciones']]
    ];
    for (const [key, value] of settingRows) {
      const inserted = await tx`
        insert into site_settings (key, value)
        values (${key}, ${tx.json(value)})
        on conflict (key) do nothing
        returning key`;
      counts.settings += inserted.length;
    }
  });
  console.log(
    `[db] seed: ${counts.products} perfiles, ${counts.variants} presentaciones, ${counts.zones} zonas de envío y ${counts.settings} ajustes nuevos; ` +
      `Pipeline: ${counts.profiles} fichas y ${counts.media} imágenes; ${counts.renamed} renombrados, ${counts.deleted} retirados y ${counts.discontinued} descontinuados`
  );
} finally {
  await sql.end();
}
