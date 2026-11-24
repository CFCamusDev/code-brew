// Registro de plantillas de línea (ADR 0004). product_lines.template guarda el nombre; una plantilla nueva es código
// y se revisa por PR (ver docs/lineas.md). Cada plantilla da tres componentes con las mismas props, y los despachadores
// src/lines/LineSection.astro, ProductPage.astro y ProductCard.astro eligen el de la línea:
//   LineSection { line: CatalogLine; products: CatalogProfile[] }
//   ProductPage { line: CatalogLine; product: CatalogProfile; offer: CatalogOffer; siblings: CatalogProfile[] }
//   ProductCard { line: CatalogLine; item: StoreItem }

export const BASE_TEMPLATE = 'base';

export const TEMPLATE_NAMES = [BASE_TEMPLATE, 'pipeline'] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

/** Plantilla que se usa de verdad: la base si la línea no tiene una o si su nombre no está registrado. */
export function resolveTemplate(name: string | null | undefined): TemplateName {
  return (TEMPLATE_NAMES as readonly string[]).includes(name ?? '') ? (name as TemplateName) : BASE_TEMPLATE;
}
