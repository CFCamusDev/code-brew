import type { StoreItem, StoreLine } from '../catalog/page-catalog';

// Filtros de /tienda (S5.6): por línea, disponibilidad y tipo. Viven en la URL (?linea=&estado=&tipo=), así cada
// filtro es un enlace que funciona sin JavaScript y se puede compartir. Un valor desconocido se ignora.

export const AVAILABILITY = { disponible: 'Disponibles', proximamente: 'Próximamente' } as const;
export const KINDS = { cafe: 'Cafés', pack: 'Packs' } as const;

export type Availability = keyof typeof AVAILABILITY;
export type Kind = keyof typeof KINDS;

export interface StoreFilters {
  line: string | null;
  availability: Availability | null;
  kind: Kind | null;
}

export const NO_FILTERS: StoreFilters = { line: null, availability: null, kind: null };

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | null =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : null;

/** Filtros válidos de la URL; los que no correspondan a una línea o valor conocido se descartan. */
export function parseFilters(params: URLSearchParams, lineSlugs: readonly string[]): StoreFilters {
  return {
    line: pick(params.get('linea'), lineSlugs),
    availability: pick(params.get('estado'), Object.keys(AVAILABILITY) as Availability[]),
    kind: pick(params.get('tipo'), Object.keys(KINDS) as Kind[])
  };
}

function matches(item: StoreItem, filters: StoreFilters): boolean {
  const { product } = item;
  if (filters.availability === 'disponible' && !product.available) return false;
  if (filters.availability === 'proximamente' && product.available) return false;
  if (filters.kind === 'pack' && product.kind !== 'pack') return false;
  if (filters.kind === 'cafe' && product.kind !== 'product') return false;
  return true;
}

/** Líneas con los productos que pasan los filtros; las que quedan vacías no se muestran. */
export function applyFilters(lines: readonly StoreLine[], filters: StoreFilters): StoreLine[] {
  return lines
    .filter(({ line }) => !filters.line || line.slug === filters.line)
    .map(({ line, items }) => ({ line, items: items.filter(item => matches(item, filters)) }))
    .filter(({ items }) => items.length > 0);
}

/** Enlace a /tienda con los filtros actuales cambiados; null quita ese filtro. */
export function filterHref(current: StoreFilters, change: Partial<StoreFilters>): string {
  const next = { ...current, ...change };
  const params = new URLSearchParams();
  if (next.line) params.set('linea', next.line);
  if (next.availability) params.set('estado', next.availability);
  if (next.kind) params.set('tipo', next.kind);
  const query = params.toString();
  return query ? `/tienda?${query}` : '/tienda';
}

/** Precio que muestra la tarjeta: el más bajo entre las presentaciones disponibles, o null. */
export function fromPrice(item: StoreItem): { price: number; several: boolean } | null {
  const prices = item.offer.variants.filter(variant => variant.available).map(variant => variant.price);
  if (!prices.length) return null;
  return { price: Math.min(...prices), several: item.offer.variants.length > 1 };
}

/** Contenido de un pack para la tarjeta («2 × Hotfix 250 g · 1 × Cold Start 250 g»); vacío si no es un pack. */
export function packContents(item: StoreItem): string {
  const variant = item.offer.variants.find(candidate => candidate.components.length > 0);
  return variant ? variant.components.map(({ quantity, name, format }) => `${quantity} × ${name} ${format}`).join(' · ') : '';
}
