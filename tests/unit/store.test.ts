import { describe, expect, it } from 'vitest';
import type { CatalogProfile, StoreItem, StoreLine } from '../../src/features/catalog/page-catalog';
import { applyFilters, filterHref, fromPrice, NO_FILTERS, packContents, parseFilters } from '../../src/features/store/store-filters';
import { isVariantAvailable } from '../../src/server/modules/catalog/domain/catalog';

// Tienda (S5.6): filtros por URL, precio de la tarjeta y disponibilidad de packs.

const profile = (slug: string, available: boolean, kind: CatalogProfile['kind'] = 'product'): CatalogProfile => ({
  slug, name: slug, num: '', available, kind, colors: {}, notes: [], facts: [], cupProfile: [], recipe: [], media: []
});
const variant = (price: number, available: boolean, components: StoreItem['offer']['variants'][number]['components'] = []) =>
  ({ sku: `sku-${price}`, format: '250 g', price, available, components });
const item = (product: CatalogProfile, variants = [variant(34, true)]): StoreItem => ({ product, offer: { variants, grinds: [] } });
const line = (slug: string) => ({ slug, name: slug, description: null, theme: {}, template: 'base' });

const lines: StoreLine[] = [
  { line: line('pipeline'), items: [item(profile('hotfix', true)), item(profile('coldstart', false), [])] },
  { line: line('origenes'), items: [item(profile('pack-duo', true, 'pack'), [variant(65, true, [{ name: 'Hotfix', format: '250 g', quantity: 2 }])])] }
];
const slugs = (result: StoreLine[]) => result.flatMap(({ items }) => items.map(({ product }) => product.slug));

describe('filtros de la tienda', () => {
  it('lee de la URL solo valores conocidos', () => {
    expect(parseFilters(new URLSearchParams('linea=pipeline&estado=proximamente&tipo=pack'), ['pipeline'])).toEqual({ line: 'pipeline', availability: 'proximamente', kind: 'pack' });
    expect(parseFilters(new URLSearchParams('linea=otra&estado=agotado&tipo=x'), ['pipeline'])).toEqual(NO_FILTERS);
  });

  it('filtra por línea, disponibilidad y tipo, y oculta las líneas que quedan vacías', () => {
    expect(slugs(applyFilters(lines, NO_FILTERS))).toEqual(['hotfix', 'coldstart', 'pack-duo']);
    expect(slugs(applyFilters(lines, { ...NO_FILTERS, line: 'origenes' }))).toEqual(['pack-duo']);
    expect(slugs(applyFilters(lines, { ...NO_FILTERS, availability: 'proximamente' }))).toEqual(['coldstart']);
    expect(applyFilters(lines, { ...NO_FILTERS, availability: 'proximamente' }).map(({ line }) => line.slug)).toEqual(['pipeline']);
    expect(slugs(applyFilters(lines, { ...NO_FILTERS, kind: 'cafe' }))).toEqual(['hotfix', 'coldstart']);
    expect(slugs(applyFilters(lines, { ...NO_FILTERS, kind: 'pack', line: 'pipeline' }))).toEqual([]);
  });

  it('arma los enlaces conservando los demás filtros', () => {
    const current = { line: 'pipeline', availability: 'disponible' as const, kind: null };
    expect(filterHref(current, { kind: 'pack' })).toBe('/tienda?linea=pipeline&estado=disponible&tipo=pack');
    expect(filterHref(current, { line: null })).toBe('/tienda?estado=disponible');
    expect(filterHref(NO_FILTERS, {})).toBe('/tienda');
  });
});

describe('tarjeta de la tienda', () => {
  it('muestra el precio más bajo disponible', () => {
    expect(fromPrice(item(profile('a', true), [variant(60, true), variant(34, false)]))).toEqual({ price: 60, several: true });
    expect(fromPrice(item(profile('a', true), [variant(34, false)]))).toBeNull();
    expect(fromPrice(item(profile('a', true)))).toEqual({ price: 34, several: false });
  });

  it('resume el contenido de un pack', () => {
    expect(packContents(lines[1].items[0])).toBe('2 × Hotfix 250 g');
    expect(packContents(lines[0].items[0])).toBe('');
  });
});

describe('disponibilidad de un pack (ADR 0003)', () => {
  const component = (stock: number, quantity = 1, active = true) => ({ stock, quantity, active });
  it('depende de que cada componente tenga stock para lo que lleva, no del stock propio', () => {
    expect(isVariantAvailable({ stock: 0, components: [component(4, 2), component(1)] })).toBe(true);
    expect(isVariantAvailable({ stock: 99, components: [component(1, 2)] })).toBe(false);
    expect(isVariantAvailable({ stock: 0, components: [component(5, 1, false)] })).toBe(false);
    expect(isVariantAvailable({ stock: 3, components: [] })).toBe(true);
    expect(isVariantAvailable({ stock: 0, components: [] })).toBe(false);
  });
});
