import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { PIPELINE } from '../../src/data/pipeline';
import { PROFILE_FIELDS, productMedia, productProfiles, products } from '../../src/lib/server/db/schema';

// Cada campo de src/data/pipeline.ts debe tener dónde vivir en la base de datos (S2.2). Si alguien agrega un campo
// al contenido de Pipeline sin su columna, esta prueba falla antes de que el seed (S2.5) lo pierda en silencio.
const destination: Record<string, [table: Record<string, unknown>, column: string]> = {
  slug: [getTableColumns(products), 'slug'],
  // catalogSlug es el slug comercial actual; S2.5 alinea ambos (hotfix) y deja uno solo.
  catalogSlug: [getTableColumns(products), 'slug'],
  name: [getTableColumns(products), 'name'],
  num: [getTableColumns(products), 'releaseNumber'],
  status: [getTableColumns(products), 'status'],
  roast: [getTableColumns(products), 'roast'],
  color: [getTableColumns(productProfiles), 'colors'],
  tint: [getTableColumns(productProfiles), 'colors'],
  glow: [getTableColumns(productProfiles), 'colors'],
  tagline: [getTableColumns(productProfiles), 'tagline'],
  method: [getTableColumns(productProfiles), 'method'],
  description: [getTableColumns(productProfiles), 'description'],
  notes: [getTableColumns(productProfiles), 'notes'],
  facts: [getTableColumns(productProfiles), 'facts'],
  profile: [getTableColumns(productProfiles), 'cupProfile'],
  recipeFor: [getTableColumns(productProfiles), 'recipeFor'],
  recipe: [getTableColumns(productProfiles), 'recipe']
};

describe('esquema del catálogo frente a src/data/pipeline.ts', () => {
  it('cada campo de los cinco perfiles tiene una columna destino', () => {
    const fields = new Set(PIPELINE.flatMap(product => Object.keys(product)));
    for (const field of fields) {
      expect(destination[field], `pipeline.ts tiene "${field}" sin columna en el esquema`).toBeDefined();
      const [table, column] = destination[field];
      expect(table[column], `${field} → ${column}`).toBeDefined();
    }
  });

  it('los campos revelables son columnas reales de product_profiles', () => {
    const columns = getTableColumns(productProfiles);
    for (const field of PROFILE_FIELDS) expect(columns[field], field).toBeDefined();
  });

  it('product_media guarda una imagen por vista y producto', () => {
    const columns = getTableColumns(productMedia);
    for (const column of ['productId', 'view', 'url', 'alt', 'sortOrder']) expect(columns[column as keyof typeof columns], column).toBeDefined();
  });
});
