import { ConflictError } from '../../../shared/errors';

// Reglas del catálogo (ADR 0003): ciclo de vida de líneas y productos, y qué necesita un producto para publicarse.
// Dominio puro: recibe datos ya leídos y decide; no conoce la base de datos.

export const PRODUCT_STATUSES = ['draft', 'upcoming', 'active', 'discontinued'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const LINE_STATUSES = ['draft', 'active', 'archived'] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];

/**
 * Transiciones permitidas de un producto:
 * - draft → upcoming (anunciarlo) o active (lanzarlo directo).
 * - upcoming → active (lanzamiento), draft (volver a preparar) o discontinued (se cancela).
 * - active → discontinued (deja de venderse).
 * - discontinued → active (vuelve a venderse).
 */
const PRODUCT_TRANSITIONS: Record<ProductStatus, readonly ProductStatus[]> = {
  draft: ['upcoming', 'active'],
  upcoming: ['active', 'draft', 'discontinued'],
  active: ['discontinued'],
  discontinued: ['active']
};

/** Transiciones de una línea: se publica, se archiva y se puede volver a publicar. */
const LINE_TRANSITIONS: Record<LineStatus, readonly LineStatus[]> = {
  draft: ['active', 'archived'],
  active: ['archived'],
  archived: ['active']
};

export function canTransitionProduct(from: ProductStatus, to: ProductStatus): boolean {
  return PRODUCT_TRANSITIONS[from].includes(to);
}

export function canTransitionLine(from: LineStatus, to: LineStatus): boolean {
  return LINE_TRANSITIONS[from].includes(to);
}

/** Lo que el dominio necesita saber de un producto para decidir si se puede publicar. */
export interface ProductForPublication {
  id: number;
  /** null mientras el producto aún no se migra al modelo de líneas (se trata como borrador). */
  status: ProductStatus | null;
  lineId: number | null;
  profile: { tagline: string | null; method: string | null; description: string | null } | null;
  imageCount: number;
  variants: { active: boolean; priceCents: number }[];
}

/** Requisito que le falta a un producto para pasar al estado pedido. El código es estable para el panel. */
export type PublicationIssue =
  | 'missing_line'
  | 'missing_tagline'
  | 'missing_method'
  | 'missing_description'
  | 'missing_image'
  | 'missing_active_variant'
  | 'missing_price';

export const ISSUE_MESSAGES: Record<PublicationIssue, string> = {
  missing_line: 'Asigna el producto a una línea.',
  missing_tagline: 'Escribe la frase del producto.',
  missing_method: 'Indica el método de preparación.',
  missing_description: 'Escribe la descripción.',
  missing_image: 'Sube una imagen principal (vista frente).',
  missing_active_variant: 'Activa al menos una presentación.',
  missing_price: 'Toda presentación activa necesita un precio mayor que cero.'
};

const filled = (value: string | null | undefined) => Boolean(value?.trim());

/**
 * Qué le falta al producto para el estado `target`:
 * - upcoming (anuncio): línea y frase. El resto puede revelarse después.
 * - active (a la venta): línea, contenido mínimo (frase, método, descripción), una imagen y al menos una
 *   presentación activa, todas con precio.
 * Pasar a draft o discontinued no exige nada.
 */
export function publicationIssues(product: ProductForPublication, target: ProductStatus): PublicationIssue[] {
  if (target !== 'upcoming' && target !== 'active') return [];
  const issues: PublicationIssue[] = [];
  if (product.lineId === null) issues.push('missing_line');
  if (!filled(product.profile?.tagline)) issues.push('missing_tagline');
  if (target === 'upcoming') return issues;

  if (!filled(product.profile?.method)) issues.push('missing_method');
  if (!filled(product.profile?.description)) issues.push('missing_description');
  if (product.imageCount === 0) issues.push('missing_image');
  const active = product.variants.filter(variant => variant.active);
  if (active.length === 0) issues.push('missing_active_variant');
  else if (active.some(variant => variant.priceCents <= 0)) issues.push('missing_price');
  return issues;
}

/** El producto no cumple los requisitos para el estado pedido; `issues` dice cuáles faltan. */
export class PublicationError extends ConflictError {
  constructor(public readonly issues: PublicationIssue[]) {
    super(`No se puede publicar: ${issues.map(issue => ISSUE_MESSAGES[issue]).join(' ')}`, 'publication_requirements');
  }
}

/** El cambio de estado no está permitido desde el estado actual. */
export class InvalidTransitionError extends ConflictError {
  constructor(entity: 'producto' | 'línea', from: string, to: string) {
    super(`Un ${entity} en estado «${from}» no puede pasar a «${to}».`, 'invalid_transition');
  }
}

/**
 * Valida el cambio de estado de un producto y devuelve el estado de partida efectivo. Un producto sin estado
 * (catálogo anterior a las líneas) se trata como borrador.
 */
export function assertProductTransition(product: ProductForPublication, target: ProductStatus): ProductStatus {
  const from = product.status ?? 'draft';
  if (from !== target && !canTransitionProduct(from, target)) throw new InvalidTransitionError('producto', from, target);
  const issues = publicationIssues(product, target);
  if (issues.length) throw new PublicationError(issues);
  return from;
}

/** Una línea solo se publica si tiene algo que mostrar: al menos un producto anunciado o a la venta. */
export function lineActivationIssues(line: { publishableProducts: number }): string[] {
  return line.publishableProducts > 0 ? [] : ['La línea necesita al menos un producto próximamente o a la venta.'];
}

// ---------- Visibilidad pública ----------

/** Contenido editorial completo de un producto (product_profiles). */
export interface ProfileContent {
  tagline: string | null;
  method: string | null;
  description: string | null;
  notes: string[];
  facts: { label: string; value: string }[];
  cupProfile: { attribute: string; level: number }[];
  recipeFor: string | null;
  recipe: { label: string; value: string }[];
}

export type RevealableField = 'tagline' | 'method' | 'description' | 'notes' | 'facts' | 'cupProfile' | 'recipe';

/** Contenido publicado: cada campo está presente solo si se puede mostrar y no está vacío. */
export type PublicProfile = { [K in keyof ProfileContent]?: NonNullable<ProfileContent[K]> };

/** Solo se muestran al público los productos anunciados o a la venta, y solo si su línea está publicada. */
export function isPubliclyVisible(productStatus: ProductStatus | null, lineStatus: LineStatus | null): productStatus is 'upcoming' | 'active' {
  return lineStatus === 'active' && (productStatus === 'upcoming' || productStatus === 'active');
}

/**
 * Lo que el público puede ver del contenido: todo si el producto está a la venta; si está «próximamente», solo los
 * campos revelados. Los campos vacíos no se publican. `recipeFor` acompaña a la receta.
 */
export function revealProfile(status: 'upcoming' | 'active', profile: ProfileContent | null, revealed: readonly string[]): PublicProfile {
  if (!profile) return {};
  const shows = (field: RevealableField) => status === 'active' || revealed.includes(field);
  const result: PublicProfile = {};
  if (shows('tagline') && profile.tagline?.trim()) result.tagline = profile.tagline;
  if (shows('method') && profile.method?.trim()) result.method = profile.method;
  if (shows('description') && profile.description?.trim()) result.description = profile.description;
  if (shows('notes') && profile.notes.length) result.notes = profile.notes;
  if (shows('facts') && profile.facts.length) result.facts = profile.facts;
  if (shows('cupProfile') && profile.cupProfile.length) result.cupProfile = profile.cupProfile;
  if (shows('recipe') && profile.recipe.length) {
    result.recipe = profile.recipe;
    if (profile.recipeFor?.trim()) result.recipeFor = profile.recipeFor;
  }
  return result;
}

/** Componente de un pack: otra presentación, en cierta cantidad (bundle_items). */
export interface BundleComponentStock {
  quantity: number;
  stock: number;
  active: boolean;
}

/**
 * Si una presentación se puede comprar ahora (ADR 0003). Un pack no tiene stock propio: está disponible solo si cada
 * componente está activo y tiene stock para la cantidad que lleva. Una presentación normal, si le queda stock.
 */
export function isVariantAvailable(variant: { stock: number; components: readonly BundleComponentStock[] }): boolean {
  if (variant.components.length) return variant.components.every(component => component.active && component.stock >= component.quantity);
  return variant.stock > 0;
}
