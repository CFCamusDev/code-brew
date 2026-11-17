import { describe, expect, it } from 'vitest';
import { PIPELINE } from '../../src/data/pipeline';
import { fromCatalog, fromStatic, offerFromCatalog } from '../../src/features/catalog/page-catalog';
import { getPublicProduct } from '../../src/server/modules/catalog/application/catalog-queries';
import type { CatalogReader, LineRecord, ProductRecord } from '../../src/server/modules/catalog/application/ports/catalog-reader';

// Catálogo de las páginas (S5.3): la base, cargada como la carga el seed (S2.5), debe pintar lo mismo que pipeline.json.

const line: LineRecord = { id: 1, slug: 'pipeline', name: 'Pipeline', description: null, status: 'active', theme: {}, template: 'pipeline' };
const entries = (pairs: (string | number)[][]) => pairs.map(([label, value]) => ({ label: String(label), value: String(value) }));

/** Producto como lo deja scripts/db/seed.mjs a partir de pipeline.json. */
function seeded(slug: string): ProductRecord {
  const profile = PIPELINE.find(candidate => candidate.slug === slug)!;
  const onSale = profile.status === 'available';
  return {
    id: Number(profile.num),
    slug: profile.catalogSlug,
    name: profile.name,
    releaseNumber: Number(profile.num),
    status: onSale ? 'active' : 'upcoming',
    launchAt: null,
    roast: profile.roast,
    grinds: onSale ? ['Grano entero', 'Molido para espresso'] : [],
    profile: {
      tagline: profile.tagline,
      method: profile.method,
      description: profile.description,
      notes: profile.notes,
      facts: entries(profile.facts),
      cupProfile: profile.profile.map(([attribute, level]) => ({ attribute: String(attribute), level: Number(level) })),
      recipeFor: profile.recipeFor,
      recipe: entries(profile.recipe),
      colors: { color: profile.color, tint: profile.tint, glow: profile.glow },
      revealedFields: onSale ? [] : ['tagline', 'method', 'recipe']
    },
    media: [],
    variants: onSale
      ? [
          { sku: `${slug}-250`, format: '250 g', priceCents: 3400, stock: 5, active: true, components: [] },
          { sku: `${slug}-500`, format: '500 g', priceCents: 6000, stock: 0, active: true, components: [] },
          { sku: `${slug}-1kg`, format: '1 kg', priceCents: 11000, stock: 9, active: false, components: [] }
        ]
      : []
  };
}

const reader: CatalogReader = {
  findLine: async () => null,
  findProduct: async slug => ({ line, product: seeded(slug) }),
  listActiveLines: async () => []
};
const view = async (slug: string) => (await getPublicProduct(reader, slug))!;

describe('catálogo de las páginas', () => {
  it('Hotfix desde la base es igual que desde pipeline.json', async () => {
    expect(fromCatalog(await view('hotfix'))).toEqual(fromStatic(PIPELINE.find(product => product.slug === 'hotfix')!));
  });

  it('un perfil próximo muestra lo revelado y oculta el tueste hasta la venta', async () => {
    for (const slug of ['coldstart', 'deploy', 'merge', 'rollback']) {
      const fromDb = fromCatalog(await view(slug));
      const fromJson = fromStatic(PIPELINE.find(product => product.slug === slug)!);
      const { slug: s, name, num, available, colors, tagline, method, recipeFor, recipe } = fromJson;
      expect(fromDb).toMatchObject({ slug: s, name, num, available, colors, tagline, method, recipeFor, recipe });
      expect(fromDb.available).toBe(false);
      expect(fromDb.roast).toBeUndefined();
      expect([fromDb.description, fromDb.notes, fromDb.facts, fromDb.cupProfile]).toEqual([undefined, [], [], []]);
    }
  });

  it('la oferta lleva precios en soles y solo presentaciones activas', async () => {
    expect(offerFromCatalog(await view('hotfix'))).toEqual({
      variants: [
        { sku: 'hotfix-250', format: '250 g', price: 34, available: true, components: [] },
        { sku: 'hotfix-500', format: '500 g', price: 60, available: false, components: [] }
      ],
      grinds: ['Grano entero', 'Molido para espresso']
    });
  });
});
