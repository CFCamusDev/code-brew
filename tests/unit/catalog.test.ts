import { describe, expect, it } from 'vitest';
import { activateLine, archiveLine, publishProduct, type CatalogDeps } from '../../src/server/modules/catalog/application/catalog-use-cases';
import type { CatalogLine } from '../../src/server/modules/catalog/application/ports/catalog-repositories';
import {
  assertProductTransition,
  canTransitionLine,
  canTransitionProduct,
  InvalidTransitionError,
  PublicationError,
  publicationIssues,
  type ProductForPublication,
  type ProductStatus
} from '../../src/server/modules/catalog/domain/catalog';
import { ConflictError, FixedClock, NotFoundError } from '../../src/server/shared';

const complete: ProductForPublication = {
  id: 1,
  status: 'draft',
  lineId: 10,
  profile: { tagline: 'Hay bugs que no esperan.', method: 'Espresso', description: 'Lavado, tueste medio-oscuro.' },
  imageCount: 2,
  variants: [
    { active: true, priceCents: 4500 },
    { active: false, priceCents: 0 }
  ]
};

describe('ciclo de vida (dominio)', () => {
  it.each([
    ['draft', 'upcoming', true],
    ['draft', 'active', true],
    ['upcoming', 'active', true],
    ['upcoming', 'draft', true],
    ['upcoming', 'discontinued', true],
    ['active', 'discontinued', true],
    ['discontinued', 'active', true],
    ['active', 'draft', false],
    ['active', 'upcoming', false],
    ['discontinued', 'upcoming', false],
    ['draft', 'discontinued', false]
  ] as [ProductStatus, ProductStatus, boolean][])('producto %s → %s: %s', (from, to, allowed) => {
    expect(canTransitionProduct(from, to)).toBe(allowed);
  });

  it('una línea se publica, se archiva y se vuelve a publicar, pero no vuelve a borrador', () => {
    expect(canTransitionLine('draft', 'active')).toBe(true);
    expect(canTransitionLine('active', 'archived')).toBe(true);
    expect(canTransitionLine('archived', 'active')).toBe(true);
    expect(canTransitionLine('active', 'draft')).toBe(false);
    expect(canTransitionLine('archived', 'draft')).toBe(false);
  });
});

describe('reglas de publicación (dominio)', () => {
  it('un producto completo se puede anunciar y lanzar', () => {
    expect(publicationIssues(complete, 'upcoming')).toEqual([]);
    expect(publicationIssues(complete, 'active')).toEqual([]);
  });

  it('para anunciarlo solo pide línea y frase', () => {
    const teaser = { ...complete, profile: { tagline: 'Muy pronto.', method: null, description: null }, imageCount: 0, variants: [] };
    expect(publicationIssues(teaser, 'upcoming')).toEqual([]);
    expect(publicationIssues({ ...teaser, lineId: null, profile: null }, 'upcoming')).toEqual(['missing_line', 'missing_tagline']);
  });

  it('no se activa sin variante activa, precio, imagen y contenido mínimo', () => {
    expect(publicationIssues({ ...complete, variants: [{ active: false, priceCents: 4500 }] }, 'active')).toEqual(['missing_active_variant']);
    expect(publicationIssues({ ...complete, variants: [{ active: true, priceCents: 0 }] }, 'active')).toEqual(['missing_price']);
    expect(publicationIssues({ ...complete, imageCount: 0 }, 'active')).toEqual(['missing_image']);
    expect(publicationIssues({ ...complete, profile: { tagline: ' ', method: '', description: null } }, 'active')).toEqual([
      'missing_tagline',
      'missing_method',
      'missing_description'
    ]);
  });

  it('volver a borrador o descontinuar no exige requisitos', () => {
    const empty = { ...complete, status: 'active' as const, lineId: null, profile: null, imageCount: 0, variants: [] };
    expect(publicationIssues(empty, 'discontinued')).toEqual([]);
    expect(publicationIssues(empty, 'draft')).toEqual([]);
  });

  it('un producto sin estado (catálogo anterior) se trata como borrador', () => {
    expect(assertProductTransition({ ...complete, status: null }, 'active')).toBe('draft');
  });

  it('informa todos los requisitos que faltan en un solo error', () => {
    try {
      assertProductTransition({ ...complete, imageCount: 0, variants: [] }, 'active');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PublicationError);
      expect((error as PublicationError).issues).toEqual(['missing_image', 'missing_active_variant']);
      expect((error as PublicationError).code).toBe('publication_requirements');
    }
  });
});

/** Repositorios en memoria con el mismo contrato que los de Drizzle. */
function memoryCatalog(options: { product?: ProductForPublication | null; line?: CatalogLine | null; publishable?: number } = {}) {
  const product = options.product === undefined ? { ...complete } : options.product;
  const line = options.line === undefined ? { id: 10, slug: 'pipeline', name: 'Pipeline', status: 'draft' as const } : options.line;
  const writes: unknown[] = [];
  const deps: CatalogDeps = {
    clock: new FixedClock(new Date('2026-11-16T15:00:00Z')),
    products: {
      async lockForPublication(id) {
        return product && product.id === id ? product : null;
      },
      async updateStatus(id, status, launchedAt) {
        writes.push({ product: id, status, launchedAt: launchedAt?.toISOString() ?? null });
      }
    },
    lines: {
      async lockLine(id) {
        return line && line.id === id ? line : null;
      },
      async countPublishableProducts() {
        return options.publishable ?? 1;
      },
      async updateStatus(id, status) {
        writes.push({ line: id, status });
      }
    }
  };
  return { deps, writes };
}

describe('PublicarProducto', () => {
  it('lanza un producto completo y registra la fecha de lanzamiento', async () => {
    const { deps, writes } = memoryCatalog();
    expect(await publishProduct(deps, 1, 'active')).toEqual({ from: 'draft', to: 'active' });
    expect(writes).toEqual([{ product: 1, status: 'active', launchedAt: '2026-11-16T15:00:00.000Z' }]);
  });

  it('anunciar no fija fecha de lanzamiento', async () => {
    const { deps, writes } = memoryCatalog();
    await publishProduct(deps, 1, 'upcoming');
    expect(writes).toEqual([{ product: 1, status: 'upcoming', launchedAt: null }]);
  });

  it('no escribe nada si el producto incumple los requisitos', async () => {
    const { deps, writes } = memoryCatalog({ product: { ...complete, variants: [] } });
    await expect(publishProduct(deps, 1, 'active')).rejects.toBeInstanceOf(PublicationError);
    expect(writes).toEqual([]);
  });

  it('rechaza transiciones no permitidas y productos inexistentes', async () => {
    const { deps } = memoryCatalog({ product: { ...complete, status: 'active' } });
    await expect(publishProduct(deps, 1, 'draft')).rejects.toBeInstanceOf(InvalidTransitionError);
    await expect(publishProduct(deps, 99, 'active')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('pedir el mismo estado no cambia nada', async () => {
    const { deps, writes } = memoryCatalog({ product: { ...complete, status: 'active' } });
    expect(await publishProduct(deps, 1, 'active')).toEqual({ from: 'active', to: 'active' });
    expect(writes).toEqual([]);
  });
});

describe('ActivarLinea y ArchivarLinea', () => {
  it('publica una línea con al menos un producto anunciado o a la venta', async () => {
    const { deps, writes } = memoryCatalog({ publishable: 5 });
    expect(await activateLine(deps, 10)).toEqual({ from: 'draft', to: 'active' });
    expect(writes).toEqual([{ line: 10, status: 'active' }]);
  });

  it('no publica una línea vacía', async () => {
    const { deps, writes } = memoryCatalog({ publishable: 0 });
    await expect(activateLine(deps, 10)).rejects.toBeInstanceOf(ConflictError);
    expect(writes).toEqual([]);
  });

  it('archiva una línea publicada y la puede volver a publicar', async () => {
    const active = memoryCatalog({ line: { id: 10, slug: 'pipeline', name: 'Pipeline', status: 'active' } });
    expect(await archiveLine(active.deps, 10)).toEqual({ from: 'active', to: 'archived' });
    const archived = memoryCatalog({ line: { id: 10, slug: 'pipeline', name: 'Pipeline', status: 'archived' } });
    expect(await activateLine(archived.deps, 10)).toEqual({ from: 'archived', to: 'active' });
  });

  it('una línea inexistente da NotFound', async () => {
    const { deps } = memoryCatalog({ line: null });
    await expect(activateLine(deps, 10)).rejects.toBeInstanceOf(NotFoundError);
  });
});
